<?php

namespace App\Http\Controllers;

use App\Jobs\MergeStreamChunksJob;
use App\Models\LiveStream;
use App\Models\LiveStreamComment;
use App\Models\LiveStreamViewer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LiveStreamController extends Controller
{
    // ─── PUBLIC ──────────────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $streams = LiveStream::whereIn('status', ['live', 'ended'])
            ->orderByRaw("FIELD(status,'live','ended')")
            ->orderBy('started_at', 'desc')
            ->get();

        return response()->json($streams);
    }

    public function show(string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)->firstOrFail();
        return response()->json($stream);
    }

    public function ping(Request $request, string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)
            ->where('status', 'live')
            ->first();

        if (!$stream) {
            return response()->json(['viewers' => 0]);
        }

        $token = $request->input('viewer_token') ?? $request->header('X-Viewer-Token', '');

        if ($token) {
            $ua = $request->userAgent() ?? '';
            $existing = LiveStreamViewer::where('live_stream_id', $stream->id)
                ->where('viewer_token', $token)
                ->first();

            if ($existing) {
                // Carbon 3: diffInSeconds es con signo — debe medirse desde el ping anterior
                $seconds = $existing->last_ping->diffInSeconds(now());
                $existing->update([
                    'last_ping'     => now(),
                    'total_seconds' => $existing->total_seconds + min($seconds, 30),
                ]);
            } else {
                LiveStreamViewer::create([
                    'live_stream_id' => $stream->id,
                    'viewer_token'   => substr($token, 0, 64),
                    'ip_address'     => $request->ip(),
                    'user_agent'     => substr($ua, 0, 300),
                    'device_type'    => LiveStreamViewer::detectDevice($ua),
                    'watch_start'    => now(),
                    'last_ping'      => now(),
                ]);
            }
        }

        // Live unique viewer count = distinct tokens seen in last 40s
        $liveCount = LiveStreamViewer::where('live_stream_id', $stream->id)
            ->where('last_ping', '>=', now()->subSeconds(40))
            ->count();

        $stream->current_viewers = $liveCount;
        if ($liveCount > $stream->peak_viewers) {
            $stream->peak_viewers = $liveCount;
        }
        $stream->save();

        return response()->json(['viewers' => $liveCount]);
    }

    public function viewers(int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);

        $viewers = LiveStreamViewer::where('live_stream_id', $id)
            ->orderBy('watch_start', 'desc')
            ->get()
            ->map(fn($v) => [
                'id'            => $v->id,
                'ip_address'    => $v->ip_address,
                'device_type'   => $v->device_type,
                'user_agent'    => $v->user_agent,
                'watch_start'   => $v->watch_start,
                'last_ping'     => $v->last_ping,
                'total_seconds' => $v->total_seconds,
                'is_online'     => $stream->status === 'live' && $v->last_ping >= now()->subSeconds(40),
            ]);

        $online    = $viewers->where('is_online', true)->count();
        $total     = $viewers->count();
        $byDevice  = $viewers->groupBy('device_type')->map->count();
        $avgWatch  = $total > 0 ? round($viewers->avg('total_seconds')) : 0;

        return response()->json([
            'viewers'     => $viewers,
            'stats' => [
                'online'      => $online,
                'total'       => $total,
                'by_device'   => $byDevice,
                'avg_watch_s' => $avgWatch,
            ],
        ]);
    }

    // ─── ADMIN ───────────────────────────────────────────────────────────

    public function adminIndex(): JsonResponse
    {
        return response()->json(
            LiveStream::orderBy('created_at', 'desc')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'        => ['required', 'string', 'max:255'],
            'description'  => ['nullable', 'string'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $data['stream_key'] = Str::random(16);
        $stream = LiveStream::create($data);

        return response()->json($stream, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $data = $request->validate([
            'title'        => ['sometimes', 'string', 'max:255'],
            'description'  => ['nullable', 'string'],
            'scheduled_at' => ['nullable', 'date'],
            'thumbnail'    => ['nullable', 'string', 'max:500'],
        ]);

        if ($request->hasFile('thumbnail_file')) {
            $request->validate(['thumbnail_file' => ['image', 'max:4096']]);
            $path = $request->file('thumbnail_file')->store("streams/{$stream->stream_key}", config('filesystems.media'));
            $data['thumbnail'] = Storage::disk(config('filesystems.media'))->url($path);
        }

        $stream->update($data);
        return response()->json($stream);
    }

    public function destroy(int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);

        if ($stream->status === 'live') {
            return response()->json(['message' => 'Detén la transmisión antes de eliminar.'], 422);
        }

        // Remove all stored chunks
        Storage::disk('public')->deleteDirectory("streams/{$stream->stream_key}");
        $stream->delete();

        return response()->json(['ok' => true]);
    }

    public function start(int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);

        if ($stream->status === 'live') {
            return response()->json(['message' => 'Ya está en vivo.'], 422);
        }

        // Clean previous chunks if re-starting
        Storage::disk('public')->deleteDirectory("streams/{$stream->stream_key}");
        Storage::disk('public')->makeDirectory("streams/{$stream->stream_key}");

        $stream->update([
            'status'          => 'live',
            'started_at'      => now(),
            'ended_at'        => null,
            'chunk_count'     => 0,
            'current_viewers' => 0,
            'peak_viewers'    => 0,
        ]);

        return response()->json($stream);
    }

    public function stop(int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);

        if ($stream->status !== 'live') {
            return response()->json(['message' => 'No está en vivo.'], 422);
        }

        $stream->update([
            'status'          => 'ended',
            'ended_at'        => now(),
            'current_viewers' => 0,
            'recording_path'  => null,
        ]);

        MergeStreamChunksJob::dispatch($stream->id);

        return response()->json($stream);
    }

    /**
     * Receive a binary WebM chunk from the broadcaster.
     * Chunks are named chunk_000001.webm, chunk_000002.webm, etc.
     */
    public function uploadChunk(Request $request, string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)
            ->where('status', 'live')
            ->firstOrFail();

        $request->validate([
            'chunk' => ['required', 'file', 'mimes:webm,ogg,mp4', 'max:51200'],
            'seq'   => ['required', 'integer', 'min:0'],
        ]);

        $seq  = (int) $request->input('seq');
        $name = sprintf('chunk_%06d.webm', $seq);
        $dir  = "streams/{$stream->stream_key}";

        $request->file('chunk')->storeAs($dir, $name, 'public');

        $newCount = max($stream->chunk_count, $seq + 1);
        $stream->update(['chunk_count' => $newCount]);

        return response()->json(['seq' => $seq, 'chunk_count' => $newCount]);
    }

    /**
     * Return comments for a stream. ?since={id} returns only newer ones.
     */
    public function getComments(Request $request, string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)->firstOrFail();
        $since  = $request->integer('since', 0);

        if ($since > 0) {
            $comments = LiveStreamComment::where('live_stream_id', $stream->id)
                ->where('id', '>', $since)
                ->orderBy('id')
                ->limit(50)
                ->get(['id', 'viewer_name', 'message', 'created_at']);
        } else {
            // Initial load: last 100 in chronological order
            $comments = LiveStreamComment::where('live_stream_id', $stream->id)
                ->orderBy('id', 'desc')
                ->limit(100)
                ->get(['id', 'viewer_name', 'message', 'created_at'])
                ->sortBy('id')
                ->values();
        }

        return response()->json($comments);
    }

    /**
     * Post a comment to a live or ended stream.
     */
    public function postComment(Request $request, string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)
            ->whereIn('status', ['live', 'ended'])
            ->firstOrFail();

        $data = $request->validate([
            'viewer_name' => ['required', 'string', 'max:100'],
            'message'     => ['required', 'string', 'max:500'],
        ]);

        $comment = LiveStreamComment::create([
            'live_stream_id' => $stream->id,
            'viewer_name'    => strip_tags($data['viewer_name']),
            'message'        => strip_tags($data['message']),
        ]);

        return response()->json([
            'id'          => $comment->id,
            'viewer_name' => $comment->viewer_name,
            'message'     => $comment->message,
            'created_at'  => $comment->created_at,
        ], 201);
    }

    /**
     * Returns stream state + chunk count for the viewer to poll.
     */
    public function info(string $key): JsonResponse
    {
        $stream = LiveStream::where('stream_key', $key)->firstOrFail();

        return response()->json([
            'id'              => $stream->id,
            'title'           => $stream->title,
            'description'     => $stream->description,
            'status'          => $stream->status,
            'chunk_count'     => $stream->chunk_count,
            'current_viewers' => $stream->current_viewers,
            'peak_viewers'    => $stream->peak_viewers,
            'started_at'      => $stream->started_at,
            'ended_at'        => $stream->ended_at,
            // Chunks served through the API (CORS-safe, no direct storage access)
            'chunks_base_url' => url("api/livestreams/{$stream->stream_key}/chunk"),
        ]);
    }

    /**
     * Serve a single WebM chunk through the API (applies CORS middleware).
     */
    public function serveChunk(string $key, int $seq)
    {
        $stream = LiveStream::where('stream_key', $key)->firstOrFail();
        $name   = sprintf('chunk_%06d.webm', $seq);
        $path   = "streams/{$key}/{$name}";

        if (!Storage::disk('public')->exists($path)) {
            abort(404, 'Chunk not found');
        }

        return response()->file(Storage::disk('public')->path($path), [
            'Content-Type'  => 'video/webm',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    /**
     * Serve the full recording.
     *
     * - If recording.webm already exists (merged): serve it with response()->file()
     *   which supports Range requests → the browser can seek anywhere in a hours-long video.
     * - If merge is still in progress (stream just ended): return 202 so the frontend
     *   knows to retry in a moment.
     * - If chunks exist but recording.webm doesn't: trigger the merge synchronously
     *   (only happens on first request; all subsequent ones hit the cached file).
     */
    public function recording(string $key)
    {
        $stream = LiveStream::where('stream_key', $key)
            ->whereIn('status', ['ended', 'live'])
            ->firstOrFail();

        $disk   = Storage::disk('public');
        $outRel = "streams/{$stream->stream_key}/recording.webm";

        // Happy path: merged file already exists
        if ($disk->exists($outRel)) {
            return response()->file($disk->path($outRel), [
                'Content-Type'  => 'video/webm',
                'Cache-Control' => 'public, max-age=86400',
                'Accept-Ranges' => 'bytes',
            ]);
        }

        // No chunks at all
        if ($stream->chunk_count === 0) {
            abort(404, 'Sin grabación disponible.');
        }

        // El Job de merge se lanzó al detener el stream.
        // Si el archivo aún no existe, el merge está en progreso.
        MergeStreamChunksJob::dispatchIf(!$disk->exists($outRel), $stream->id);

        return response()->json(['status' => 'processing'], 202);
    }
}
