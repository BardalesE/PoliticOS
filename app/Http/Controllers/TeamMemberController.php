<?php

namespace App\Http\Controllers;

use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TeamMemberController extends Controller
{
    // GET /api/team-members  (público)
    public function index(): JsonResponse
    {
        $members = TeamMember::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        return response()->json($members);
    }

    // GET /api/admin/team-members  (admin — paginado)
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            TeamMember::orderBy('sort_order')->orderBy('id')->paginate(20)
        );
    }

    // POST /api/admin/team-members  (admin)
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:150'],
            'role'          => ['required', 'string', 'max:150'],
            'description'   => ['nullable', 'string'],
            'photo'         => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
            'facebook_url'  => ['nullable', 'string', 'max:500'],
            'instagram_url' => ['nullable', 'string', 'max:500'],
            'sort_order'    => ['nullable', 'integer'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('photo')) {
            $path = $request->file('photo')->store('team', config('filesystems.media'));
            $data['photo_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['photo']);

        $member = TeamMember::create($data);
        return response()->json($member, 201);
    }

    // PUT /api/admin/team-members/{id}  (admin)
    public function update(Request $request, int $id): JsonResponse
    {
        $member = TeamMember::findOrFail($id);

        $data = $request->validate([
            'name'          => ['sometimes', 'required', 'string', 'max:150'],
            'role'          => ['sometimes', 'required', 'string', 'max:150'],
            'description'   => ['nullable', 'string'],
            'photo'         => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
            'facebook_url'  => ['nullable', 'string', 'max:500'],
            'instagram_url' => ['nullable', 'string', 'max:500'],
            'sort_order'    => ['nullable', 'integer'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('photo')) {
            if ($member->photo_url) {
                $mediaDisk = config('filesystems.media');
                $base = Storage::disk($mediaDisk)->url('');
                Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $member->photo_url), '/'));
            }
            $path = $request->file('photo')->store('team', config('filesystems.media'));
            $data['photo_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['photo']);

        $member->update($data);
        return response()->json($member->fresh());
    }

    // DELETE /api/admin/team-members/{id}  (admin)
    public function destroy(int $id): JsonResponse
    {
        $member = TeamMember::findOrFail($id);

        if ($member->photo_url) {
            $mediaDisk = config('filesystems.media');
            $base = Storage::disk($mediaDisk)->url('');
            Storage::disk($mediaDisk)->delete(ltrim(str_replace($base, '', $member->photo_url), '/'));
        }

        $member->delete();
        return response()->json(['deleted' => true]);
    }
}
