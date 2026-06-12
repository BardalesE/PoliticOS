<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\KnowledgeDocument;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Estado del onboarding del tenant para el wizard de /admin/onboarding.
 *
 * El provisioning (tenant:provision) siembra el perfil con placeholders
 * ("Por definir", bio "Editar desde el panel..."); un campo con ese valor
 * cuenta como faltante, igual que uno vacío.
 */
class OnboardingController extends Controller
{
    private const PLACEHOLDER = 'Por definir';

    // GET /api/admin/onboarding/status
    public function status(): JsonResponse
    {
        $profile = CandidateProfile::current();

        $missing = [];
        foreach (['name', 'title', 'location', 'party'] as $field) {
            $value = trim((string) ($profile?->{$field} ?? ''));
            if ($value === '' || strcasecmp($value, self::PLACEHOLDER) === 0) {
                $missing[] = $field;
            }
        }

        $bio = trim((string) ($profile?->bio ?? ''));
        if ($bio === '' || str_contains($bio, 'Editar desde el panel de administración')) {
            $missing[] = 'bio';
        }

        $optionalMissing = [];
        foreach (['tagline', 'photo_url'] as $field) {
            if (trim((string) ($profile?->{$field} ?? '')) === '') {
                $optionalMissing[] = $field;
            }
        }

        $totalDocs   = KnowledgeDocument::where('is_active', true)->count();
        $indexedDocs = KnowledgeDocument::where('is_active', true)
            ->where('embeddings_indexed', true)
            ->count();

        return response()->json([
            'completed_at' => Setting::getValue('onboarding_completed_at'),
            'profile'      => [
                'complete'         => empty($missing),
                'missing'          => $missing,
                'optional_missing' => $optionalMissing,
            ],
            'knowledge'    => [
                'total'   => $totalDocs,
                'indexed' => $indexedDocs,
            ],
        ]);
    }

    // POST /api/admin/onboarding/complete
    public function complete(Request $request): JsonResponse
    {
        $completedAt = Setting::getValue('onboarding_completed_at');

        if (!$completedAt) {
            $completedAt = now()->toIso8601String();
            Setting::setValue('onboarding_completed_at', $completedAt);
        }

        return response()->json(['completed_at' => $completedAt]);
    }
}
