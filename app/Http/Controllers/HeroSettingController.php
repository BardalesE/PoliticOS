<?php

namespace App\Http\Controllers;

use App\Models\HeroSetting;
use App\Services\FrontendRevalidationService;
use App\Support\CacheBust;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class HeroSettingController extends Controller
{
    public function __construct(private FrontendRevalidationService $revalidation) {}

    // GET /api/hero-settings  (público)
    public function show(): JsonResponse
    {
        $hero = HeroSetting::where('is_active', true)->first();
        if (!$hero) return response()->json(null); // frontend usa defaults

        // Cache-busting: solo en la respuesta pública (ver CacheBust). El
        // endpoint de admin (adminShow) devuelve la URL canónica sin tocar.
        $data = $hero->toArray();
        $data['image_url'] = CacheBust::url($hero->image_url, $hero->updated_at);
        $data['video_url'] = CacheBust::url($hero->video_url, $hero->updated_at);

        return response()->json($data);
    }

    // GET /api/admin/hero-settings  (admin)
    public function adminShow(): JsonResponse
    {
        $hero = HeroSetting::firstOrNew([]);
        return response()->json($hero);
    }

    // PUT /api/admin/hero-settings  (admin)
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'           => ['required', 'string', 'max:200'],
            'subtitle'        => ['nullable', 'string', 'max:600'],
            'badge_text'      => ['nullable', 'string', 'max:150'],
            'video_url'       => ['nullable', 'string', 'max:500'],
            'image_url'       => ['nullable', 'string', 'max:500'],
            'overlay_opacity' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'overlay_color'   => ['nullable', 'string', 'max:20'],
            'btn1_label'      => ['nullable', 'string', 'max:100'],
            'btn1_url'        => ['nullable', 'string', 'max:300'],
            'btn2_label'      => ['nullable', 'string', 'max:100'],
            'btn2_url'        => ['nullable', 'string', 'max:300'],
            'btn3_label'      => ['nullable', 'string', 'max:100'],
            'btn3_url'        => ['nullable', 'string', 'max:300'],
            'is_active'       => ['nullable', 'boolean'],
        ]);

        $hero = HeroSetting::firstOrNew([]);
        $hero->fill($data)->save();

        $this->revalidation->notify(app('tenant')?->slug);

        return response()->json($hero);
    }

    // POST /api/admin/hero-settings/upload-video  (admin)
    public function uploadVideo(Request $request): JsonResponse
    {
        $request->validate([
            'video' => ['required', 'file', 'mimes:mp4,webm,mov,ogg', 'max:512000'], // 500 MB
        ]);

        $file = $request->file('video');
        $path = $file->store('hero', config('filesystems.media'));
        $url  = Storage::disk(config('filesystems.media'))->url($path);

        $hero = HeroSetting::firstOrNew([]);
        $hero->video_url = $url;
        $hero->save();

        $this->revalidation->notify(app('tenant')?->slug);

        return response()->json(['url' => $url, 'hero' => $hero]);
    }
}
