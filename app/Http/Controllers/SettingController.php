<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    // GET /api/home-settings  (público)
    public function publicIndex(): JsonResponse
    {
        return response()->json(Setting::allAsArray());
    }

    // GET /api/admin/settings  (admin)
    public function adminIndex(): JsonResponse
    {
        return response()->json(Setting::allAsArray());
    }

    // PUT /api/admin/settings  (admin — bulk update)
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings'   => ['required', 'array'],
            'settings.*' => ['nullable', 'string', 'max:1000'],
        ]);

        foreach ($data['settings'] as $key => $value) {
            Setting::setValue($key, $value);
        }

        return response()->json(Setting::allAsArray());
    }
}
