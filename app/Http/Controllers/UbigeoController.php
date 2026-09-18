<?php

namespace App\Http\Controllers;

use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Datos de referencia del INEI para los dropdowns en cascada del panel admin
 * (departamento → provincia → distrito). Solo lectura, sin datos sensibles.
 */
class UbigeoController extends Controller
{
    public function departamentos(): JsonResponse
    {
        return response()->json(
            UbigeoDepartamento::orderBy('departamento')->get(['id', 'departamento as nombre', 'ubigeo'])
        );
    }

    public function provincias(Request $request): JsonResponse
    {
        $data = $request->validate(['departamento_id' => ['required', 'integer']]);

        return response()->json(
            UbigeoProvincia::where('departamento_id', $data['departamento_id'])
                ->orderBy('provincia')->get(['id', 'provincia as nombre', 'ubigeo'])
        );
    }

    public function distritos(Request $request): JsonResponse
    {
        $data = $request->validate(['provincia_id' => ['required', 'integer']]);

        return response()->json(
            UbigeoDistrito::where('provincia_id', $data['provincia_id'])
                ->orderBy('distrito')->get(['id', 'distrito as nombre', 'ubigeo'])
        );
    }
}
