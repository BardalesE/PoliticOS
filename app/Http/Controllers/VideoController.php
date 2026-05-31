<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\Http\JsonResponse;

class VideoController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Video::orderByDesc('views')->orderByDesc('published_at')->get()
        );
    }
}
