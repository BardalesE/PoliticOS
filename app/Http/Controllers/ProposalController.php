<?php

namespace App\Http\Controllers;

use App\Models\Proposal;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProposalController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $proposals = Proposal::query()
            ->when($request->district, fn($q, $d) => $q->where('district', $d))
            ->when($request->topic,    fn($q, $t) => $q->where('topic', $t))
            ->orderBy('priority')
            ->get();

        return response()->json($proposals);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(Proposal::findOrFail($id));
    }
}
