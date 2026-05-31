<?php

namespace App\Http\Controllers;

use App\Models\AttackResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AttackResponseController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            AttackResponse::orderByDesc('priority')->orderBy('attack_keyword')->paginate(50)
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateInput($request);
        $resp = AttackResponse::create($data);
        Cache::forget('attack_responses_map');
        return response()->json($resp, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $resp = AttackResponse::findOrFail($id);
        $resp->update($this->validateInput($request, true));
        Cache::forget('attack_responses_map');
        return response()->json($resp);
    }

    public function destroy(int $id): JsonResponse
    {
        AttackResponse::where('id', $id)->delete();
        Cache::forget('attack_responses_map');
        return response()->json(['deleted' => true]);
    }

    private function validateInput(Request $request, bool $partial = false): array
    {
        $rules = [
            'attack_keyword'    => [$partial ? 'sometimes' : 'required', 'string','max:100'],
            'synonyms'          => ['nullable','array'],
            'synonyms.*'        => ['string','max:100'],
            'attack_category'   => [$partial ? 'sometimes' : 'required', 'in:personal,partido,pasado,propuesta,rival,otro'],
            'response_template' => [$partial ? 'sometimes' : 'required', 'string','max:5000'],
            'deflection_topic'  => ['nullable','string','max:40'],
            'priority'          => ['nullable','integer','min:0','max:100'],
            'is_active'         => ['nullable','boolean'],
        ];
        return $request->validate($rules);
    }
}
