<?php

namespace App\Http\Controllers;

use App\Models\CampaignPhoto;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class GalleryController extends Controller
{
    // GET /api/gallery  (público)
    public function index(Request $request): JsonResponse
    {
        $query = CampaignPhoto::orderByDesc('created_at');
        if ($request->filled('category') && $request->category !== 'todos') {
            $query->where('category', $request->category);
        }
        return response()->json($query->paginate(24));
    }

    // GET /api/admin/gallery  (admin)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            CampaignPhoto::orderByDesc('created_at')->paginate(20)
        );
    }

    // POST /api/admin/gallery  (admin)
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'image'    => ['required', 'file', 'image', 'mimes:jpeg,png,webp,gif', 'max:10240'],
            'title'    => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:60'],
        ]);

        $file = $request->file('image');
        $path = $file->store('campaign/photos', config('filesystems.media'));
        $url  = Storage::disk(config('filesystems.media'))->url($path);

        $photo = CampaignPhoto::create([
            'url'      => $url,
            'title'    => $request->input('title'),
            'category' => $request->input('category', 'general'),
            'size'     => $file->getSize(),
        ]);

        return response()->json($photo, 201);
    }

    // PUT /api/admin/gallery/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $photo = CampaignPhoto::findOrFail($id);
        $data  = $request->validate([
            'title'      => ['nullable', 'string', 'max:255'],
            'category'   => ['nullable', 'string', 'max:60'],
            'image_file' => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp,gif', 'max:10240'],
        ]);

        if ($request->hasFile('image_file')) {
            $mediaDisk = config('filesystems.media');
            $base = Storage::disk($mediaDisk)->url('');
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $photo->url), '/'));

            $file         = $request->file('image_file');
            $path         = $file->store('campaign/photos', $mediaDisk);
            $data['url']  = Storage::disk($mediaDisk)->url($path);
            $data['size'] = $file->getSize();
        }
        unset($data['image_file']);

        $photo->update($data);
        return response()->json($photo);
    }

    // DELETE /api/admin/gallery/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $photo = CampaignPhoto::findOrFail($id);

        // Eliminar archivo físico del storage
        $mediaDisk = config('filesystems.media');
        $relativePath = ltrim(str_replace(Storage::disk($mediaDisk)->url(''), '', $photo->url), '/');
        Storage::disk($mediaDisk)->delete($relativePath);

        $photo->delete();
        return response()->json(['deleted' => true]);
    }

    // GET /api/gallery/categories  (público)
    public function categories(): JsonResponse
    {
        $cats = CampaignPhoto::select('category')
            ->distinct()
            ->orderBy('category')
            ->pluck('category');
        return response()->json($cats);
    }
}
