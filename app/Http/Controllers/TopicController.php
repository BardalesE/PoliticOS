<?php

namespace App\Http\Controllers;

use App\Models\Topic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TopicController extends Controller
{
    // GET /api/admin/topics
    public function index(): JsonResponse
    {
        return response()->json(Topic::orderBy('sort_order')->paginate(50));
    }

    // POST /api/admin/topics
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['required', 'string', 'max:40', 'unique:topics,name'],
            'label'      => ['required', 'string', 'max:100'],
            'emoji'      => ['nullable', 'string', 'max:10'],
            'keywords'   => ['required', 'array', 'min:1'],
            'keywords.*' => ['string', 'max:100'],
            'color'      => ['nullable', 'string', 'max:20'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
        ]);

        return response()->json(Topic::create($data), 201);
    }

    // PUT /api/admin/topics/{id}
    public function update(Request $request, int $id): JsonResponse
    {
        $topic = Topic::findOrFail($id);
        $data  = $request->validate([
            'name'       => ['sometimes', 'string', 'max:40', "unique:topics,name,{$id}"],
            'label'      => ['sometimes', 'string', 'max:100'],
            'emoji'      => ['nullable', 'string', 'max:10'],
            'keywords'   => ['sometimes', 'array', 'min:1'],
            'keywords.*' => ['string', 'max:100'],
            'color'      => ['nullable', 'string', 'max:20'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
        ]);
        $topic->update($data);
        return response()->json($topic);
    }

    // DELETE /api/admin/topics/{id}
    public function destroy(int $id): JsonResponse
    {
        Topic::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }
}
