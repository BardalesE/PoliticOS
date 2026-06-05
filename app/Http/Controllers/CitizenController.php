<?php

namespace App\Http\Controllers;

use App\Jobs\ReverseGeocodeJob;
use App\Models\CitizenProfile;
use App\Models\CitizenPoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CitizenController extends Controller
{
    // ─── POST /api/citizen/register ──────────────────────────────────────
    // Registro público — desde el chat, formulario web o QR
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'             => ['required', 'string', 'max:150'],
            'phone_whatsapp'   => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:255'],
            'dni'              => ['nullable', 'string', 'max:20'],
            'district'         => ['nullable', 'string', 'max:100'],
            'age_range'        => ['nullable', 'string', 'max:20'],
            'occupation'       => ['nullable', 'string', 'max:100'],
            'voting_intention' => ['nullable', 'in:alta,media,baja,opositor,indeciso'],
            'visitor_uuid'     => ['nullable', 'string', 'max:36'],
            'referred_by_code' => ['nullable', 'string', 'max:16'],
            'source'           => ['nullable', 'in:chat,web_form,qr,referral'],
            'consent'          => ['required', 'accepted'],
            'lat'              => ['nullable', 'numeric', 'between:-90,90'],
            'lng'              => ['nullable', 'numeric', 'between:-180,180'],
            'accuracy'         => ['nullable', 'numeric', 'min:0'],
        ]);

        // Anti-duplicados: buscar por contacto existente
        $existing = CitizenProfile::findByContact(
            $data['phone_whatsapp'] ?? null,
            $data['email']          ?? null,
            $data['dni']            ?? null
        );

        if ($existing) {
            // Actualizar datos faltantes sin sobreescribir lo que ya tenía
            $updates = array_filter([
                'name'             => $existing->name     ?: ($data['name']          ?? null),
                'district'         => $existing->district ?: ($data['district']       ?? null),
                'age_range'        => $existing->age_range?: ($data['age_range']      ?? null),
                'occupation'       => $existing->occupation?:($data['occupation']     ?? null),
                'voting_intention' => $existing->voting_intention ?: ($data['voting_intention'] ?? null),
                'visitor_uuid'     => $existing->visitor_uuid ?: ($data['visitor_uuid'] ?? null),
            ]);
            $existing->update($updates);

            return response()->json([
                'status'        => 'existing',
                'citizen_id'    => $existing->id,
                'referral_code' => $existing->referral_code,
                'points'        => $existing->points_balance,
                'message'       => 'Ya tienes un perfil registrado.',
            ]);
        }

        // Registro nuevo
        DB::beginTransaction();
        try {
            $referralCode = CitizenProfile::generateReferralCode();

            $hasBrowserGeo = !empty($data['lat']) && !empty($data['lng']);

            $citizen = CitizenProfile::create([
                'visitor_uuid'        => $data['visitor_uuid']     ?? null,
                'name'                => $data['name'],
                'phone_whatsapp'      => $data['phone_whatsapp']   ?? null,
                'email'               => $data['email']            ?? null,
                'dni'                 => $data['dni']              ?? null,
                'district'            => $data['district']         ?? null,
                'age_range'           => $data['age_range']        ?? null,
                'occupation'          => $data['occupation']       ?? null,
                'voting_intention'    => $data['voting_intention'] ?? null,
                'source'              => $data['source']           ?? 'web_form',
                'referred_by_code'    => $data['referred_by_code'] ?? null,
                'referral_code'       => $referralCode,
                'consented'           => true,
                'consent_at'          => now(),
                'consent_ip'          => $request->ip(),
                'browser_lat'         => $hasBrowserGeo ? $data['lat']      : null,
                'browser_lng'         => $hasBrowserGeo ? $data['lng']      : null,
                'browser_accuracy'    => $hasBrowserGeo ? ($data['accuracy'] ?? null) : null,
                'browser_location_at' => $hasBrowserGeo ? now()             : null,
            ]);

            // Reverse geocoding async si hay GPS
            if ($hasBrowserGeo) {
                ReverseGeocodeJob::dispatch($citizen->id, (float) $data['lat'], (float) $data['lng'])
                    ->afterResponse();
            }

            // Puntos por registro
            $citizen->addPoints('registro', CitizenProfile::pointsFor('registro'));

            // Si tiene todos los datos principales → puntos extra
            if ($citizen->isProfileComplete()) {
                $citizen->addPoints('perfil_completo', CitizenProfile::pointsFor('perfil_completo'));
            }

            // Premiar a quien lo refirió
            if (!empty($data['referred_by_code'])) {
                $referrer = CitizenProfile::where('referral_code', $data['referred_by_code'])->first();
                if ($referrer) {
                    $referrer->addPoints(
                        'referido_exitoso',
                        CitizenProfile::pointsFor('referido_exitoso'),
                        ['new_citizen_id' => $citizen->id]
                    );
                }
            }

            DB::commit();

            return response()->json([
                'status'        => 'registered',
                'citizen_id'    => $citizen->id,
                'referral_code' => $citizen->referral_code,
                'points'        => $citizen->points_balance,
                'message'       => '¡Gracias por registrarte! Comparte tu enlace y gana más puntos.',
                'share_url'     => url("/registro?ref={$referralCode}"),
            ], 201);

        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Error al registrar. Por favor intenta de nuevo.'], 500);
        }
    }

    // ─── GET /api/citizen/profile/{uuid} ─────────────────────────────────
    // Perfil público por visitor_uuid (para mostrar puntos en el chat)
    public function showByUuid(string $uuid): JsonResponse
    {
        $citizen = CitizenProfile::where('visitor_uuid', $uuid)->first();

        if (!$citizen) {
            return response()->json(['registered' => false], 200);
        }

        return response()->json([
            'registered'    => true,
            'name'          => $citizen->name,
            'points'        => $citizen->points_balance,
            'referral_code' => $citizen->referral_code,
            'share_url'     => url("/registro?ref={$citizen->referral_code}"),
        ]);
    }

    // ─── GET /api/citizen/referral/{code} ────────────────────────────────
    // Info del referidor para mostrar en la página de registro
    public function referralInfo(string $code): JsonResponse
    {
        $referrer = CitizenProfile::where('referral_code', $code)->first();

        if (!$referrer) {
            return response()->json(['valid' => false]);
        }

        $count = CitizenProfile::where('referred_by_code', $code)->count();

        return response()->json([
            'valid'           => true,
            'referrer_name'   => $referrer->name ? explode(' ', $referrer->name)[0] : 'Un ciudadano',
            'referral_count'  => $count,
        ]);
    }

    // ─── GET /api/admin/citizens ──────────────────────────────────────────
    // Lista para el panel admin con filtros y paginación
    public function adminIndex(Request $request): JsonResponse
    {
        $q = CitizenProfile::query();

        if ($request->filled('district'))   $q->where('district', $request->district);
        if ($request->filled('source'))     $q->where('source', $request->source);
        if ($request->filled('intention'))  $q->where('voting_intention', $request->intention);
        if ($request->filled('search')) {
            $search = $request->search;
            $q->where(function ($sub) use ($search) {
                $sub->where('name', 'like', "%{$search}%")
                    ->orWhere('phone_whatsapp', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $total = $q->count();
        $citizens = $q->orderByDesc('created_at')
            ->select([
                'id', 'name', 'phone_whatsapp', 'email', 'district',
                'voting_intention', 'source', 'points_balance',
                'referral_code', 'created_at',
            ])
            ->paginate(50);

        // Métricas de resumen
        $summary = [
            'total'       => $total,
            'with_phone'  => CitizenProfile::whereNotNull('phone_whatsapp')->count(),
            'with_email'  => CitizenProfile::whereNotNull('email')->count(),
            'by_intention'=> CitizenProfile::selectRaw('voting_intention, COUNT(*) as count')
                                ->whereNotNull('voting_intention')
                                ->groupBy('voting_intention')
                                ->pluck('count', 'voting_intention'),
            'by_district' => CitizenProfile::selectRaw('district, COUNT(*) as count')
                                ->whereNotNull('district')
                                ->groupBy('district')
                                ->orderByDesc('count')
                                ->limit(10)
                                ->pluck('count', 'district'),
            'top_referrers' => CitizenProfile::selectRaw('citizen_profiles.referral_code, citizen_profiles.name, COUNT(*) as referidos')
                                ->join('citizen_profiles as referred', 'citizen_profiles.referral_code', '=', 'referred.referred_by_code')
                                ->groupBy('citizen_profiles.referral_code', 'citizen_profiles.name')
                                ->orderByDesc('referidos')
                                ->limit(5)
                                ->get(),
        ];

        return response()->json([
            'citizens' => $citizens,
            'summary'  => $summary,
        ]);
    }

    // ─── GET /api/admin/citizens/export ──────────────────────────────────
    // CSV para campañas de WhatsApp masivo
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $query = CitizenProfile::query()
            ->whereNotNull('phone_whatsapp')
            ->orderByDesc('created_at');

        if ($request->filled('district'))   $query->where('district', $request->district);
        if ($request->filled('intention'))  $query->where('voting_intention', $request->intention);

        $headers = [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="ciudadanos_' . now()->format('Ymd_His') . '.csv"',
        ];

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF)); // BOM UTF-8
            fputcsv($handle, ['Nombre', 'WhatsApp', 'Email', 'Distrito', 'Intención de voto', 'Puntos', 'Fuente', 'Fecha de registro']);

            $query->chunk(500, function ($rows) use ($handle) {
                foreach ($rows as $r) {
                    fputcsv($handle, [
                        $r->name, $r->phone_whatsapp, $r->email, $r->district,
                        $r->voting_intention, $r->points_balance, $r->source,
                        $r->created_at?->format('d/m/Y H:i'),
                    ]);
                }
            });
            fclose($handle);
        }, 'ciudadanos.csv', $headers);
    }

    // ─── GET /api/citizen/check-dni/{dni} ────────────────────────────────────
    // Verifica si un DNI ya está registrado (validación en tiempo real durante el chat)
    public function checkDni(string $dni): JsonResponse
    {
        if (!preg_match('/^\d{8}$/', $dni)) {
            return response()->json(['exists' => false, 'valid' => false]);
        }
        $exists = CitizenProfile::where('dni', $dni)->exists();
        return response()->json(['exists' => $exists, 'valid' => true]);
    }

    // ─── POST /api/citizen/chat-award ─────────────────────────────────────
    // Llamado internamente desde ChatController para dar puntos por conversación
    public function awardChatPoints(string $visitorUuid, string $action = 'conversacion'): void
    {
        $citizen = CitizenProfile::where('visitor_uuid', $visitorUuid)->first();
        if ($citizen && $action === 'conversacion') {
            $today = now()->toDateString();
            $alreadyAwarded = CitizenPoint::where('citizen_profile_id', $citizen->id)
                ->where('action', 'conversacion')
                ->whereDate('created_at', $today)
                ->exists();

            if (!$alreadyAwarded) {
                $citizen->addPoints('conversacion', CitizenProfile::pointsFor('conversacion'));
            }
        }
    }
}
