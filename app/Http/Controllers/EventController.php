<?php

namespace App\Http\Controllers;

use App\Models\Event;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class EventController extends Controller
{
    // GET /api/events  (público — todos los activos ordenados por fecha)
    public function index(): JsonResponse
    {
        $events = Event::where('is_active', true)
            ->orderBy('event_date')
            ->get();
        return response()->json($events);
    }

    // GET /api/events/featured  (público — evento destacado más próximo)
    public function featured(): JsonResponse
    {
        $event = Event::where('is_active', true)
            ->where('is_featured', true)
            ->where('event_date', '>=', now())
            ->orderBy('event_date')
            ->first();

        // Fallback: cualquier evento activo próximo
        if (!$event) {
            $event = Event::where('is_active', true)
                ->where('event_date', '>=', now())
                ->orderBy('event_date')
                ->first();
        }

        return response()->json($event);
    }

    // GET /api/admin/events  (admin — paginado)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            Event::orderBy('event_date')->paginate(12)
        );
    }

    // POST /api/admin/events  (admin)
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'event_date'  => ['required', 'date'],
            'location'    => ['nullable', 'string', 'max:200'],
            'address'     => ['nullable', 'string', 'max:300'],
            'image'       => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
            'image_url'   => ['nullable', 'string', 'max:500'],
            'stream_url'  => ['nullable', 'string', 'max:500'],
            'is_active'   => ['nullable', 'boolean'],
            'is_featured' => ['nullable', 'boolean'],
            'sort_order'  => ['nullable', 'integer'],
        ]);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('events', config('filesystems.media'));
            $data['image_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['image']);

        $event = Event::create($data);
        return response()->json($event, 201);
    }

    // PUT /api/admin/events/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $event = Event::findOrFail($id);

        $data = $request->validate([
            'title'       => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'event_date'  => ['sometimes', 'required', 'date'],
            'location'    => ['nullable', 'string', 'max:200'],
            'address'     => ['nullable', 'string', 'max:300'],
            'image'       => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
            'image_url'   => ['nullable', 'string', 'max:500'],
            'stream_url'  => ['nullable', 'string', 'max:500'],
            'is_active'   => ['nullable', 'boolean'],
            'is_featured' => ['nullable', 'boolean'],
            'sort_order'  => ['nullable', 'integer'],
        ]);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('events', config('filesystems.media'));
            $data['image_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['image']);

        $event->update($data);
        return response()->json($event->fresh());
    }

    // DELETE /api/admin/events/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $event = Event::findOrFail($id);

        if ($event->image_url) {
            $mediaDisk = config('filesystems.media');
            $base = Storage::disk($mediaDisk)->url('');
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $event->image_url), '/'));
        }

        $event->delete();
        return response()->json(['deleted' => true]);
    }
}
