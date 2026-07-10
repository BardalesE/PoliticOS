<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use App\Models\SuggestedQuestion;
use App\Models\Topic;
use App\Models\District;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CandidateProfileController extends Controller
{
    // GET /api/candidate  (público)
    public function show(): JsonResponse
    {
        $profile   = CandidateProfile::current();
        $questions = SuggestedQuestion::where('is_active', true)
            ->orderBy('sort_order')
            ->get(['question', 'topic']);
        $topics    = Topic::where('is_active', true)
            ->orderBy('sort_order')
            ->get(['name', 'label', 'emoji', 'color']);
        $districts = District::where('is_active', true)
            ->orderBy('sort_order')
            ->pluck('name');
        // "Lugares Visitados" (home pública) — subconjunto de districts que
        // ya tiene fecha real de visita. Campo nuevo, no reemplaza
        // `districts` (Hero/OpinionSection lo siguen usando como lista
        // simple de nombres para el buscador de zona).
        $visitedPlaces = District::visitedPublic();
        $ai = \App\Models\AiSetting::current();

        return response()->json([
            'profile'             => $profile,
            'suggested_questions' => $questions,
            'topics'              => $topics,
            'districts'           => $districts,
            'visited_places'      => $visitedPlaces,
            'chat_btn'            => [
                'text'     => $ai->chat_btn_text,
                'subtitle' => $ai->chat_subtitle ?? 'IA · 24/7',
                'shape'    => $ai->chat_btn_shape ?? 'pill',
                'color'    => $ai->chat_btn_color,
                'size'     => $ai->chat_btn_size ?? 'md',
                'position' => $ai->chat_btn_position ?? 'bottom-right',
            ],
        ]);
    }

    // GET /api/admin/candidate-profile  (admin — devuelve el activo)
    public function adminShow(): JsonResponse
    {
        return response()->json(CandidateProfile::current());
    }

    // GET /api/admin/branding  (admin — datos de marca para el panel)
    public function branding(): JsonResponse
    {
        $p = CandidateProfile::current();
        return response()->json([
            'name'          => $p?->name,
            'party'         => $p?->party,
            'color_primary' => $p?->color_primary ?? '#DC2626',
            'color_dark'    => $p?->color_dark    ?? '#7F1D1D',
            'color_accent'  => $p?->color_accent  ?? '#C9A84C',
            'logo_url'      => $p?->logo_url,
            'photo_url'     => $p?->photo_url,
        ]);
    }

    // PUT /api/admin/candidate-profile  (admin — edita el activo)
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'preset_name'    => ['sometimes', 'string', 'max:120'],
            'name'           => ['sometimes', 'string', 'max:150'],
            'title'          => ['sometimes', 'string', 'max:200'],
            'location'       => ['sometimes', 'string', 'max:150'],
            'party'          => ['sometimes', 'string', 'max:100'],
            'list_number'    => ['nullable', 'string', 'max:10'],
            'bio'            => ['nullable', 'string'],
            'tagline'        => ['nullable', 'string', 'max:300'],
            'election_date'  => ['nullable', 'string', 'max:80'],
            'photo_url'      => ['nullable', 'string', 'max:500'],
            'logo_url'       => ['nullable', 'string', 'max:500'],
            'hero_photo_url' => ['nullable', 'string', 'max:500'],
            'hero_video_url' => ['nullable', 'string', 'max:500'],
            'color_primary'  => ['nullable', 'string', 'max:20'],
            'color_dark'     => ['nullable', 'string', 'max:20'],
            'color_accent'   => ['nullable', 'string', 'max:20'],
            'tiktok_url'     => ['nullable', 'string', 'max:500'],
            'facebook_url'   => ['nullable', 'string', 'max:500'],
            'instagram_url'  => ['nullable', 'string', 'max:500'],
            'whatsapp_number' => ['nullable', 'string', 'max:20'],
        ]);

        // NOT NULL columns with DB defaults: replace null (from ConvertEmptyStringsToNull) with defaults
        $data['list_number']   = $data['list_number']   ?? '1';
        $data['color_primary'] = $data['color_primary'] ?? '#DC2626';
        $data['color_dark']    = $data['color_dark']    ?? '#7F1D1D';
        $data['color_accent']  = $data['color_accent']  ?? '#C9A84C';

        $profile = CandidateProfile::firstOrNew(['is_active' => true]);
        $profile->is_active = true;
        $profile->fill($data)->save();

        return response()->json($profile);
    }

    // ─── Presets ───────────────────────────────────────────────────────────

    // GET /api/admin/candidate-presets  (lista todos)
    public function listPresets(): JsonResponse
    {
        return response()->json(
            CandidateProfile::orderByDesc('is_active')
                ->orderBy('id')
                ->get()
        );
    }

    // POST /api/admin/candidate-presets  (crea nuevo preset)
    public function createPreset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'preset_name'    => ['required', 'string', 'max:120'],
            'name'           => ['required', 'string', 'max:150'],
            'title'          => ['sometimes', 'string', 'max:200'],
            'location'       => ['sometimes', 'string', 'max:150'],
            'party'          => ['sometimes', 'string', 'max:100'],
            'list_number'    => ['nullable', 'string', 'max:10'],
            'bio'            => ['nullable', 'string'],
            'tagline'        => ['nullable', 'string', 'max:300'],
            'election_date'  => ['nullable', 'string', 'max:80'],
            'photo_url'      => ['nullable', 'string', 'max:500'],
            'logo_url'       => ['nullable', 'string', 'max:500'],
            'hero_photo_url' => ['nullable', 'string', 'max:500'],
            'hero_video_url' => ['nullable', 'string', 'max:500'],
            'color_primary'  => ['nullable', 'string', 'max:20'],
            'color_dark'     => ['nullable', 'string', 'max:20'],
            'color_accent'   => ['nullable', 'string', 'max:20'],
            'tiktok_url'     => ['nullable', 'string', 'max:500'],
            'facebook_url'   => ['nullable', 'string', 'max:500'],
            'instagram_url'  => ['nullable', 'string', 'max:500'],
            'whatsapp_number' => ['nullable', 'string', 'max:20'],
        ]);

        $data['list_number']   = $data['list_number']   ?? '1';
        $data['color_primary'] = $data['color_primary'] ?? '#DC2626';
        $data['color_dark']    = $data['color_dark']    ?? '#7F1D1D';
        $data['color_accent']  = $data['color_accent']  ?? '#C9A84C';
        $data['is_active'] = false;
        $preset = CandidateProfile::create($data);

        return response()->json($preset, 201);
    }

    // POST /api/admin/candidate-presets/{id}/activate  (activa un preset)
    public function activatePreset(int $id): JsonResponse
    {
        $preset = CandidateProfile::findOrFail($id);

        DB::transaction(function () use ($preset) {
            CandidateProfile::where('is_active', true)->update(['is_active' => false]);
            $preset->update(['is_active' => true]);
        });

        return response()->json($preset->fresh());
    }

    // DELETE /api/admin/candidate-presets/{id}  (elimina un preset no activo)
    public function deletePreset(int $id): JsonResponse
    {
        $preset = CandidateProfile::findOrFail($id);

        if ($preset->is_active) {
            return response()->json(['error' => 'No puedes eliminar el perfil activo.'], 422);
        }

        $preset->delete();
        return response()->json(['deleted' => true]);
    }
}
