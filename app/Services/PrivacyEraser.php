<?php

namespace App\Services;

use App\Models\CandidateSupportVote;
use App\Models\ChatSession;
use App\Models\CitizenData;
use App\Models\CitizenProfile;
use App\Models\ContactVerification;
use App\Models\VisitorProfile;
use App\Models\VisitorSegment;
use Illuminate\Support\Facades\DB;

/**
 * Borra los datos personales de un ciudadano en la BD del tenant ACTUAL
 * (derecho de cancelación, Ley 29733). Llamar dentro del request del tenant o de
 * TenantContext::run($slug, ...).
 *
 * Qué se borra (todo lo ligado a su visitor_uuid o a su contacto):
 *   chat_sessions (y en cascada chat_messages y citizen_data), citizen_data suelto,
 *   visitor_profiles, visitor_segments (su zona), candidate_support_votes (sus votos),
 *   contact_verifications, citizen_profiles (y en cascada citizen_points).
 *
 * Los agregados que ya se calcularon (conteos por tema, clusters) no guardan
 * datos personales y se conservan.
 */
class PrivacyEraser
{
    /** @return array<string,int> filas borradas por tabla */
    public function eraseVisitor(string $visitorUuid): array
    {
        return DB::transaction(function () use ($visitorUuid) {
            $sessionIds = ChatSession::where('visitor_uuid', $visitorUuid)->pluck('id');

            return [
                'chat_messages'         => $sessionIds->isEmpty() ? 0 : \App\Models\ChatMessage::whereIn('session_id', $sessionIds)->count(),
                'chat_sessions'         => ChatSession::whereIn('id', $sessionIds)->delete(),
                'citizen_data'          => CitizenData::where('visitor_uuid', $visitorUuid)->delete(),
                'visitor_profiles'      => VisitorProfile::where('visitor_uuid', $visitorUuid)->delete(),
                'visitor_segments'      => VisitorSegment::where('visitor_uuid', $visitorUuid)->delete(),
                'support_votes'         => CandidateSupportVote::where('visitor_uuid', $visitorUuid)->delete(),
                'contact_verifications' => ContactVerification::where('visitor_uuid', $visitorUuid)->delete(),
                'citizen_profiles'      => CitizenProfile::where('visitor_uuid', $visitorUuid)->delete(),
            ];
        });
    }

    /**
     * Para quien pide la cancelación desde otro dispositivo: se ubica por el
     * contacto que dejó al registrarse (WhatsApp o correo) y se borra todo lo de
     * esos navegadores. Solo lo ejecuta el superadmin, tras verificar identidad.
     *
     * @return array<string,int>
     */
    public function eraseByContact(?string $email, ?string $phone): array
    {
        $email  = $email ? trim($email) : null;
        $digits = $phone ? preg_replace('/\D/', '', $phone) : null;
        if ($digits !== null && strlen($digits) < 9) {
            $digits = null; // un número incompleto calzaría con muchos otros
        }

        // Sin contacto válido NO se toca nada (un where vacío borraría a todos).
        if (! $email && ! $digits) {
            return [];
        }

        $profiles = CitizenProfile::query()
            ->where(function ($q) use ($email, $digits) {
                if ($email)  $q->orWhere('email', $email);
                if ($digits) $q->orWhere('phone_whatsapp', 'like', '%' . substr($digits, -9));
            })
            ->get(['id', 'visitor_uuid']);

        $total = ['citizen_profiles' => 0];
        foreach ($profiles->pluck('visitor_uuid')->filter()->unique() as $uuid) {
            foreach ($this->eraseVisitor($uuid) as $k => $n) {
                $total[$k] = ($total[$k] ?? 0) + $n;
            }
        }
        // Perfiles sin visitor_uuid (registrados por otra vía).
        $total['citizen_profiles'] += CitizenProfile::whereIn('id', $profiles->pluck('id'))->delete();

        return $total;
    }
}
