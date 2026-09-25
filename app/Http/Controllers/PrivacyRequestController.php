<?php

namespace App\Http\Controllers;

use App\Models\PrivacyRequest;
use App\Services\PrivacyEraser;
use App\Services\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Derechos ARCO (Ley 29733) + reclamos.
 *
 *   Público (desde /privacidad, con el tenant del request):
 *     POST /api/privacidad/solicitudes
 *       - "cancelacion" + erase_now + visitor_uuid → borra YA los datos de ese
 *         navegador en la BD del tenant y deja la solicitud "atendida".
 *       - cualquier otro caso → queda "recibida" con su plazo legal para el superadmin.
 *
 *   Superadmin (X-Super-Admin-Key):
 *     GET  /api/superadmin/privacy-requests            listado + conteos
 *     PUT  /api/superadmin/privacy-requests/{id}       estado + nota de respuesta
 *     POST /api/superadmin/privacy-requests/{id}/erase borra los datos en su tenant
 */
class PrivacyRequestController extends Controller
{
    public function __construct(private PrivacyEraser $eraser) {}

    // ─── Público ───────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type'         => ['required', Rule::in(PrivacyRequest::TYPES)],
            'visitor_uuid' => ['nullable', 'uuid'],
            'erase_now'    => ['nullable', 'boolean'],
            'name'         => ['nullable', 'string', 'max:150'],
            'email'        => ['nullable', 'email:rfc', 'max:150'],
            'phone'        => ['nullable', 'string', 'max:30', 'regex:/^[0-9+\s()-]{6,30}$/'],
            'description'  => ['nullable', 'string', 'max:2000'],
        ]);

        $selfErase = $data['type'] === 'cancelacion'
            && ! empty($data['erase_now'])
            && ! empty($data['visitor_uuid']);

        // Para responder hace falta un contacto; el borrado del propio dispositivo no lo necesita.
        if (! $selfErase && empty($data['email']) && empty($data['phone'])) {
            throw ValidationException::withMessages([
                'email' => 'Déjanos un correo o un WhatsApp para responderte.',
            ]);
        }

        $record = new PrivacyRequest([
            'code'         => PrivacyRequest::newCode(),
            'tenant_slug'  => TenantContext::currentSlug(),
            'type'         => $data['type'],
            'status'       => 'recibida',
            'visitor_uuid' => $data['visitor_uuid'] ?? null,
            'name'         => $data['name'] ?? null,
            'email'        => $data['email'] ?? null,
            'phone'        => $data['phone'] ?? null,
            'description'  => $data['description'] ?? null,
            'due_at'       => PrivacyRequest::dueDateFor($data['type']),
            'ip_hash'      => $request->ip() ? hash_hmac('sha256', $request->ip(), (string) config('app.key')) : null,
        ]);

        if ($selfErase) {
            $record->erased_counts        = $this->eraser->eraseVisitor($data['visitor_uuid']);
            $record->erased_automatically = true;
            $record->status               = 'atendida';
            $record->resolved_at          = now();
            $record->resolution_note      = 'Borrado automático de los datos ligados a este dispositivo.';
        }

        $record->save();

        return response()->json([
            'code'          => $record->code,
            'status'        => $record->status,
            'due_at'        => $record->due_at?->toDateString(),
            'erased'        => $record->erased_automatically,
            'erased_counts' => $record->erased_counts,
        ], 201);
    }

    // ─── Superadmin ────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $q = PrivacyRequest::query()
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->string('status')))
            ->when($request->filled('type'), fn ($x) => $x->where('type', $request->string('type')))
            ->when($request->filled('q'), function ($x) use ($request) {
                $term = '%' . $request->string('q') . '%';
                $x->where(fn ($w) => $w->where('code', 'like', $term)
                    ->orWhere('name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('phone', 'like', $term));
            })
            // Pendientes primero, por vencimiento; luego lo resuelto, lo más reciente arriba.
            ->orderByRaw("CASE WHEN status IN ('recibida','en_proceso') THEN 0 ELSE 1 END")
            ->orderBy('due_at')
            ->orderByDesc('id');

        $page = $q->paginate(50);

        $counts = PrivacyRequest::query()
            ->selectRaw('status, COUNT(*) as n')
            ->groupBy('status')
            ->pluck('n', 'status');

        $overdue = PrivacyRequest::query()
            ->whereIn('status', ['recibida', 'en_proceso'])
            ->whereDate('due_at', '<', now()->toDateString())
            ->count();

        return response()->json([
            'data'      => $page->items(),
            'total'     => $page->total(),
            'last_page' => $page->lastPage(),
            'counts'    => $counts,
            'overdue'   => $overdue,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status'          => ['required', Rule::in(PrivacyRequest::STATUSES)],
            'resolution_note' => ['nullable', 'string', 'max:4000'],
        ]);

        $r = PrivacyRequest::findOrFail($id);
        $r->status          = $data['status'];
        $r->resolution_note = $data['resolution_note'] ?? $r->resolution_note;
        $r->resolved_at     = in_array($data['status'], ['atendida', 'rechazada'], true) ? ($r->resolved_at ?? now()) : null;
        $r->save();

        return response()->json($r);
    }

    /** Ejecuta el borrado en la BD del tenant de origen (por dispositivo y/o por contacto). */
    public function erase(int $id): JsonResponse
    {
        $r = PrivacyRequest::findOrFail($id);

        $counts = TenantContext::run($r->tenant_slug, function () use ($r) {
            $total = [];
            $sets  = [];
            if ($r->visitor_uuid) $sets[] = $this->eraser->eraseVisitor($r->visitor_uuid);
            if ($r->email || $r->phone) $sets[] = $this->eraser->eraseByContact($r->email, $r->phone);
            foreach ($sets as $set) {
                foreach ($set as $k => $n) $total[$k] = ($total[$k] ?? 0) + $n;
            }
            return $total;
        });

        $r->erased_counts   = $counts;
        $r->status          = 'atendida';
        $r->resolved_at     = $r->resolved_at ?? now();
        $r->resolution_note = trim(($r->resolution_note ? $r->resolution_note . "\n" : '')
            . 'Datos borrados por el superadmin el ' . now()->format('d/m/Y H:i') . '.');
        $r->save();

        return response()->json($r);
    }
}
