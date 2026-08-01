<?php

namespace App\Http\Controllers;

use App\Models\Achievement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AchievementController extends Controller
{
    // GET /api/achievements  (público)
    public function index(): JsonResponse
    {
        return response()->json(Achievement::activePublic());
    }

    // GET /api/admin/achievements  (admin — paginado)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            Achievement::orderBy('sort_order')->orderBy('id')->paginate(20)
        );
    }

    private function validationRules(bool $partial = false): array
    {
        $req = $partial ? ['sometimes', 'required'] : ['required'];
        return [
            'title'            => [...$req, 'string', 'max:200'],
            'description'      => ['nullable', 'string'],
            'metric_label'     => ['nullable', 'string', 'max:100'],
            'metric_value'     => ['nullable', 'string', 'max:50'],
            'photo_before'     => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:8192'],
            'photo_after'      => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:8192'],
            'district'         => ['nullable', 'string', 'max:100'],
            'status'           => ['nullable', 'in:completado,en_curso'],
            'sort_order'       => ['nullable', 'integer'],
            'is_active'        => ['nullable', 'boolean'],
        ];
    }

    private function uploadPhoto(Request $request, string $field, string $targetField, array &$data): void
    {
        if (!$request->hasFile($field)) return;
        $path = $request->file($field)->store('achievements', config('filesystems.media'));
        $data[$targetField] = Storage::disk(config('filesystems.media'))->url($path);
    }

    private function deletePhoto(?string $url): void
    {
        if (!$url) return;
        $mediaDisk = config('filesystems.media');
        $base = Storage::disk($mediaDisk)->url('');
        Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $url), '/'));
    }

    // POST /api/admin/achievements  (admin)
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->validationRules());

        $this->uploadPhoto($request, 'photo_before', 'photo_before_url', $data);
        $this->uploadPhoto($request, 'photo_after', 'photo_after_url', $data);
        unset($data['photo_before'], $data['photo_after']);

        $achievement = Achievement::create($data);
        return response()->json($achievement, 201);
    }

    // PUT /api/admin/achievements/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $achievement = Achievement::findOrFail($id);
        $data = $request->validate($this->validationRules(partial: true));

        if ($request->hasFile('photo_before')) {
            $this->deletePhoto($achievement->photo_before_url);
            $this->uploadPhoto($request, 'photo_before', 'photo_before_url', $data);
        }
        if ($request->hasFile('photo_after')) {
            $this->deletePhoto($achievement->photo_after_url);
            $this->uploadPhoto($request, 'photo_after', 'photo_after_url', $data);
        }
        unset($data['photo_before'], $data['photo_after']);

        $achievement->update($data);
        return response()->json($achievement->fresh());
    }

    // DELETE /api/admin/achievements/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $achievement = Achievement::findOrFail($id);
        $this->deletePhoto($achievement->photo_before_url);
        $this->deletePhoto($achievement->photo_after_url);
        $achievement->delete();
        return response()->json(['deleted' => true]);
    }
}
