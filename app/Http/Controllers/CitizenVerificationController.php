<?php

namespace App\Http\Controllers;

use App\Services\Verification\ContactVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CitizenVerificationController extends Controller
{
    public function __construct(private readonly ContactVerificationService $verification) {}

    // GET /api/citizen/verify/config — qué canales se verifican hoy en este tenant/servidor.
    public function config(): JsonResponse
    {
        $active = $this->verification->activeChannels();

        return response()->json([
            'enabled'  => $active !== [],
            'channels' => [
                'email'    => in_array(ContactVerificationService::EMAIL, $active, true),
                'whatsapp' => in_array(ContactVerificationService::WHATSAPP, $active, true),
            ],
        ]);
    }

    // POST /api/citizen/verify/start — envía el código. No revela si el contacto ya estaba registrado.
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel'      => ['required', 'in:email,whatsapp'],
            'contact'      => ['required', 'string', 'max:255'],
            'visitor_uuid' => ['nullable', 'string', 'max:36'],
        ]);

        $sent = $this->verification->start($data['channel'], $data['contact'], $data['visitor_uuid'] ?? null, $request->ip());

        return response()->json(['status' => 'sent', 'channel' => $data['channel']] + $sent);
    }

    // POST /api/citizen/verify/confirm — valida el código.
    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel'      => ['required', 'in:email,whatsapp'],
            'contact'      => ['required', 'string', 'max:255'],
            'code'         => ['required', 'string', 'max:12'],
            'visitor_uuid' => ['nullable', 'string', 'max:36'],
        ]);

        $this->verification->confirm($data['channel'], $data['contact'], $data['code'], $data['visitor_uuid'] ?? null);

        return response()->json(['status' => 'verified', 'channel' => $data['channel']]);
    }
}
