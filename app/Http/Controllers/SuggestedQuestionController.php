<?php

namespace App\Http\Controllers;

use App\Models\SuggestedQuestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SuggestedQuestionController extends Controller
{
    // GET /api/admin/suggested-questions
    public function index(): JsonResponse
    {
        return response()->json(SuggestedQuestion::orderBy('sort_order')->paginate(50));
    }

    // POST /api/admin/suggested-questions
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question'   => ['required', 'string', 'max:300'],
            'topic'      => ['nullable', 'string', 'max:40'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
        ]);
        return response()->json(SuggestedQuestion::create($data), 201);
    }

    // PUT /api/admin/suggested-questions/{id}
    public function update(Request $request, int $id): JsonResponse
    {
        $q    = SuggestedQuestion::findOrFail($id);
        $data = $request->validate([
            'question'   => ['sometimes', 'string', 'max:300'],
            'topic'      => ['nullable', 'string', 'max:40'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
        ]);
        $q->update($data);
        return response()->json($q);
    }

    // DELETE /api/admin/suggested-questions/{id}
    public function destroy(int $id): JsonResponse
    {
        SuggestedQuestion::findOrFail($id)->delete();
        return response()->json(['deleted' => true]);
    }
}
