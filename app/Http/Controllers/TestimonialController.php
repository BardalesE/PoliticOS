<?php

namespace App\Http\Controllers;

use App\Models\Testimonial;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TestimonialController extends Controller
{
    // GET /api/testimonials  (público)
    public function index(): JsonResponse
    {
        return response()->json(Testimonial::activePublic());
    }

    // GET /api/admin/testimonials  (admin — paginado)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            Testimonial::orderBy('sort_order')->orderBy('id')->paginate(20)
        );
    }

    // POST /api/admin/testimonials  (admin)
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:150'],
            'role'       => ['nullable', 'string', 'max:150'],
            'photo'      => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
            'quote'      => ['required', 'string'],
            'district'   => ['nullable', 'string', 'max:100'],
            'sort_order' => ['nullable', 'integer'],
            'is_active'  => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('photo')) {
            $path = $request->file('photo')->store('testimonials', config('filesystems.media'));
            $data['photo_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['photo']);

        $testimonial = Testimonial::create($data);
        return response()->json($testimonial, 201);
    }

    // PUT /api/admin/testimonials/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $testimonial = Testimonial::findOrFail($id);

        $data = $request->validate([
            'name'       => ['sometimes', 'required', 'string', 'max:150'],
            'role'       => ['nullable', 'string', 'max:150'],
            'photo'      => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
            'quote'      => ['sometimes', 'required', 'string'],
            'district'   => ['nullable', 'string', 'max:100'],
            'sort_order' => ['nullable', 'integer'],
            'is_active'  => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('photo')) {
            if ($testimonial->photo_url) {
                $mediaDisk = config('filesystems.media');
                $base = Storage::disk($mediaDisk)->url('');
                Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $testimonial->photo_url), '/'));
            }
            $path = $request->file('photo')->store('testimonials', config('filesystems.media'));
            $data['photo_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['photo']);

        $testimonial->update($data);
        return response()->json($testimonial->fresh());
    }

    // DELETE /api/admin/testimonials/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $testimonial = Testimonial::findOrFail($id);

        if ($testimonial->photo_url) {
            $mediaDisk = config('filesystems.media');
            $base = Storage::disk($mediaDisk)->url('');
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $testimonial->photo_url), '/'));
        }

        $testimonial->delete();
        return response()->json(['deleted' => true]);
    }
}
