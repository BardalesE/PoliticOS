<?php

namespace App\Http\Controllers;

use App\Models\CampaignVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CampaignVideoController extends Controller
{
    // GET /api/campaign-videos  (público)
    public function index(Request $request): JsonResponse
    {
        $query = CampaignVideo::orderByDesc('created_at');
        if ($request->filled('category') && $request->category !== 'todos') {
            $query->where('category', $request->category);
        }
        return response()->json($query->paginate(12));
    }

    // GET /api/admin/campaign-videos  (admin)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            CampaignVideo::orderByDesc('created_at')->paginate(12)
        );
    }

    // POST /api/admin/campaign-videos  (admin)
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'video'     => ['required', 'file', 'mimes:mp4,webm,mov,avi', 'max:204800'], // 200 MB
            'thumbnail' => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
            'title'     => ['nullable', 'string', 'max:255'],
            'category'  => ['nullable', 'string', 'max:60'],
        ]);

        $videoFile = $request->file('video');
        $videoPath = $videoFile->store('campaign/videos', config('filesystems.media'));
        $videoUrl  = Storage::disk(config('filesystems.media'))->url($videoPath);

        $thumbUrl = null;
        if ($request->hasFile('thumbnail')) {
            $thumbPath = $request->file('thumbnail')->store('campaign/thumbnails', config('filesystems.media'));
            $thumbUrl  = Storage::disk(config('filesystems.media'))->url($thumbPath);
        }

        $video = CampaignVideo::create([
            'url'       => $videoUrl,
            'thumbnail' => $thumbUrl,
            'title'     => $request->input('title'),
            'category'  => $request->input('category', 'general'),
            'size'      => $videoFile->getSize(),
        ]);

        return response()->json($video, 201);
    }

    // PUT /api/admin/campaign-videos/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $video = CampaignVideo::findOrFail($id);
        $data  = $request->validate([
            'title'          => ['nullable', 'string', 'max:255'],
            'category'       => ['nullable', 'string', 'max:60'],
            'video_file'     => ['nullable', 'file', 'mimes:mp4,webm,mov,avi', 'max:204800'],
            'thumbnail_file' => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
        ]);

        $mediaDisk = config('filesystems.media');
        $base = Storage::disk($mediaDisk)->url('');

        if ($request->hasFile('video_file')) {
            $old = ltrim(str_replace($base, '', $video->url), '/');
            Storage::disk($mediaDisk)->delete($old);

            $vf            = $request->file('video_file');
            $path          = $vf->store('campaign/videos', $mediaDisk);
            $data['url']   = Storage::disk($mediaDisk)->url($path);
            $data['size']  = $vf->getSize();
        }

        if ($request->hasFile('thumbnail_file')) {
            if ($video->thumbnail) {
                $old = ltrim(str_replace($base, '', $video->thumbnail), '/');
                Storage::disk($mediaDisk)->delete($old);
            }
            $tf                = $request->file('thumbnail_file');
            $path              = $tf->store('campaign/thumbnails', $mediaDisk);
            $data['thumbnail'] = Storage::disk($mediaDisk)->url($path);
        }

        unset($data['video_file'], $data['thumbnail_file']);
        $video->update($data);
        return response()->json($video);
    }

    // DELETE /api/admin/campaign-videos/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $video = CampaignVideo::findOrFail($id);

        $mediaDisk = config('filesystems.media');
        $base = Storage::disk($mediaDisk)->url('');

        Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $video->url), '/'));

        if ($video->thumbnail) {
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $video->thumbnail), '/'));
        }

        $video->delete();
        return response()->json(['deleted' => true]);
    }
}
