<?php

namespace App\Http\Controllers;

use App\Models\District;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DistrictController extends Controller
{
    // GET /api/admin/districts
    public function index(): JsonResponse
    {
        return response()->json(District::orderBy('sort_order')->paginate(50));
    }

    // POST /api/admin/districts
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                 => ['required', 'string', 'max:100'],
            'keywords'             => ['required', 'array', 'min:1'],
            'keywords.*'           => ['string', 'max:100'],
            'sort_order'           => ['nullable', 'integer', 'min:0'],
            'is_active'            => ['nullable', 'boolean'],
            'visited_at'           => ['nullable', 'date'],
            'event_type'           => ['nullable', 'string', 'max:100'],
            'highlight_text'       => ['nullable', 'string', 'max:2000'],
            'highlight_photo_url'  => ['nullable', 'string', 'max:500'],
            'highlight_video_url'  => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json(District::create($data), 201);
    }

    // PUT /api/admin/districts/{id}
    public function update(Request $request, int $id): JsonResponse
    {
        $district = District::findOrFail($id);
        $data = $request->validate([
            'name'                 => ['sometimes', 'string', 'max:100'],
            'keywords'             => ['sometimes', 'array', 'min:1'],
            'keywords.*'           => ['string', 'max:100'],
            'sort_order'           => ['nullable', 'integer', 'min:0'],
            'is_active'            => ['nullable', 'boolean'],
            'visited_at'           => ['nullable', 'date'],
            'event_type'           => ['nullable', 'string', 'max:100'],
            'highlight_text'       => ['nullable', 'string', 'max:2000'],
            'highlight_photo_url'  => ['nullable', 'string', 'max:500'],
            'highlight_video_url'  => ['nullable', 'string', 'max:500'],
        ]);
        $district->update($data);
        return response()->json($district);
    }

    // DELETE /api/admin/districts/{id}
    public function destroy(int $id): JsonResponse
    {
        District::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }

    // POST /api/admin/districts/upload-video  (admin)
    // Endpoint propio (no reusa /admin/hero-settings/upload-video) porque
    // ese tiene el efecto colateral de sobreescribir el video del Hero. Este
    // solo guarda el archivo y devuelve la URL — sin tocar ninguna otra fila.
    public function uploadVideo(Request $request): JsonResponse
    {
        $request->validate([
            'video' => ['required', 'file', 'mimes:mp4,webm,mov,ogg', 'max:512000'], // 500 MB
        ]);

        $file = $request->file('video');
        $path = $file->store('districts/videos', config('filesystems.media'));
        $url  = Storage::disk(config('filesystems.media'))->url($path);

        return response()->json(['url' => $url]);
    }
}
