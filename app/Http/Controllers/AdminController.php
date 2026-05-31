<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\Faq;
use App\Models\Proposal;
use App\Models\User;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    // ─── PROPOSALS ────────────────────────────────────────────────

    public function listProposals(): JsonResponse
    {
        return response()->json(Proposal::orderBy('priority')->paginate(20));
    }

    public function storeProposal(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'         => ['required', 'string', 'max:255'],
            'description'   => ['required', 'string'],
            'district'      => ['nullable', 'string', 'max:80'],
            'topic'         => ['required', 'string', 'max:40'],
            'budget'        => ['nullable', 'numeric', 'min:0'],
            'priority'      => ['nullable', 'integer', 'between:1,10'],
            'status'        => ['nullable', 'in:propuesta,en_curso,completada'],
            'image'         => ['nullable', 'string', 'max:500'],
            'document_url'  => ['nullable', 'string', 'max:500'],
            'image_file'    => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp,gif', 'max:8192'],
            'document_file' => ['nullable', 'file', 'mimes:pdf,doc,docx,xlsx,pptx', 'max:20480'],
        ]);

        if ($request->hasFile('image_file')) {
            $path = $request->file('image_file')->store('proposals/images', config('filesystems.media'));
            $data['image'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        if ($request->hasFile('document_file')) {
            $path = $request->file('document_file')->store('proposals/docs', config('filesystems.media'));
            $data['document_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['image_file'], $data['document_file']);

        return response()->json(Proposal::create($data), 201);
    }

    public function updateProposal(Request $request, int $id): JsonResponse
    {
        $proposal = Proposal::findOrFail($id);
        $data = $request->validate([
            'title'         => ['sometimes', 'string', 'max:255'],
            'description'   => ['sometimes', 'string'],
            'district'      => ['nullable', 'string', 'max:80'],
            'topic'         => ['sometimes', 'string', 'max:40'],
            'budget'        => ['nullable', 'numeric', 'min:0'],
            'priority'      => ['nullable', 'integer', 'between:1,10'],
            'status'        => ['nullable', 'in:propuesta,en_curso,completada'],
            'image'         => ['nullable', 'string', 'max:500'],
            'document_url'  => ['nullable', 'string', 'max:500'],
            'image_file'    => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp,gif', 'max:8192'],
            'document_file' => ['nullable', 'file', 'mimes:pdf,doc,docx,xlsx,pptx', 'max:20480'],
        ]);

        if ($request->hasFile('image_file')) {
            $path = $request->file('image_file')->store('proposals/images', config('filesystems.media'));
            $data['image'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        if ($request->hasFile('document_file')) {
            $path = $request->file('document_file')->store('proposals/docs', config('filesystems.media'));
            $data['document_url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['image_file'], $data['document_file']);

        $proposal->update($data);
        return response()->json($proposal);
    }

    public function deleteProposal(int $id): JsonResponse
    {
        Proposal::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }

    // ─── VIDEOS ───────────────────────────────────────────────────

    public function listVideos(): JsonResponse
    {
        return response()->json(Video::orderByDesc('views')->paginate(20));
    }

    public function storeVideo(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'        => ['required', 'string', 'max:255'],
            'url'          => ['nullable', 'url', 'max:500'],
            'video_file'   => ['nullable', 'file', 'mimes:mp4,webm,mov,avi', 'max:204800'],
            'thumbnail'    => ['nullable', 'string', 'max:500'],
            'views'        => ['nullable', 'integer', 'min:0'],
            'topic'        => ['nullable', 'string', 'max:40'],
            'published_at' => ['nullable', 'date'],
        ]);

        if ($request->hasFile('video_file')) {
            $path = $request->file('video_file')->store('videos', config('filesystems.media'));
            $data['url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['video_file']);

        if (empty($data['url'])) {
            return response()->json(['message' => 'Debes proveer una URL o subir un archivo de video.'], 422);
        }

        return response()->json(Video::create($data), 201);
    }

    public function updateVideo(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);
        $data = $request->validate([
            'title'        => ['sometimes', 'string', 'max:255'],
            'url'          => ['nullable', 'url', 'max:500'],
            'video_file'   => ['nullable', 'file', 'mimes:mp4,webm,mov,avi', 'max:204800'],
            'thumbnail'    => ['nullable', 'string', 'max:500'],
            'views'        => ['nullable', 'integer', 'min:0'],
            'topic'        => ['nullable', 'string', 'max:40'],
            'published_at' => ['nullable', 'date'],
        ]);

        if ($request->hasFile('video_file')) {
            $path = $request->file('video_file')->store('videos', config('filesystems.media'));
            $data['url'] = Storage::disk(config('filesystems.media'))->url($path);
        }
        unset($data['video_file']);

        $video->update($data);
        return response()->json($video);
    }

    public function deleteVideo(int $id): JsonResponse
    {
        Video::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }

    // ─── FAQs ─────────────────────────────────────────────────────

    public function listFaqs(): JsonResponse
    {
        return response()->json(Faq::orderBy('priority')->paginate(20));
    }

    public function storeFaq(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:500'],
            'answer'   => ['required', 'string'],
            'topic'    => ['nullable', 'string', 'max:40'],
            'priority' => ['nullable', 'integer', 'between:1,10'],
        ]);
        return response()->json(Faq::create($data), 201);
    }

    public function updateFaq(Request $request, int $id): JsonResponse
    {
        $faq = Faq::findOrFail($id);
        $data = $request->validate([
            'question' => ['sometimes', 'string', 'max:500'],
            'answer'   => ['sometimes', 'string'],
            'topic'    => ['nullable', 'string', 'max:40'],
            'priority' => ['nullable', 'integer', 'between:1,10'],
        ]);
        $faq->update($data);
        return response()->json($faq);
    }

    public function deleteFaq(int $id): JsonResponse
    {
        Faq::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }

    // ─── USERS ────────────────────────────────────────────────────

    public function listUsers(): JsonResponse
    {
        return response()->json(User::select('id', 'name', 'email', 'role', 'created_at')
            ->orderByDesc('created_at')
            ->paginate(20));
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:255'],
            'email'    => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role'     => ['nullable', 'in:admin,editor'],
        ]);
        $data['password'] = Hash::make($data['password']);
        $user = User::create($data);
        return response()->json($user->only('id', 'name', 'email', 'role', 'created_at'), 201);
    }

    public function updateUser(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $data = $request->validate([
            'name'     => ['sometimes', 'string', 'max:255'],
            'email'    => ['sometimes', 'email', Rule::unique('users')->ignore($id)],
            'password' => ['nullable', 'string', 'min:8'],
            'role'     => ['nullable', 'in:admin,editor'],
        ]);
        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        $user->update($data);
        return response()->json($user->only('id', 'name', 'email', 'role', 'created_at'));
    }

    public function deleteUser(int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        if ($user->id === request()->user()->id) {
            return response()->json(['message' => 'No puedes eliminarte a ti mismo.'], 422);
        }
        $user->tokens()->delete();
        $user->delete();
        return response()->json(['deleted' => true]);
    }

    // ─── CHAT SESSIONS ────────────────────────────────────────────

    public function listSessions(): JsonResponse
    {
        return response()->json(
            ChatSession::withCount('messages')
                ->orderByDesc('created_at')
                ->paginate(20)
        );
    }

    public function showSession(int $id): JsonResponse
    {
        $session = ChatSession::with('messages')->findOrFail($id);
        return response()->json($session);
    }
}
