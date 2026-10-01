<?php

namespace App\Http\Controllers;

use App\Models\CandidateProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Panel "Consumo de IA": tokens y costo por proveedor, modelo, día, propósito y
 * candidato (datos de la tabla ai_usage, ver App\Services\AiUsage).
 */
class AiUsoController extends Controller
{
    public function resumen(Request $request): JsonResponse
    {
        $dias = max(1, min(90, (int) $request->query('dias', 30)));
        if (! Schema::hasTable('ai_usage')) {
            return response()->json(['disponible' => false]);
        }

        $desde = now()->subDays($dias - 1)->startOfDay();
        $base  = fn () => DB::table('ai_usage')->where('created_at', '>=', $desde);
        $tok   = 'SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens)';
        $gratis = config('ai_precios.gratis', []);

        $porModelo = $base()
            ->selectRaw("provider, model, COUNT(*) as llamadas, SUM(CASE WHEN ok THEN 0 ELSE 1 END) as fallos,
                SUM(input_tokens) as entrada, SUM(output_tokens) as salida,
                SUM(cache_read_tokens + cache_write_tokens) as cache, {$tok} as tokens,
                SUM(costo_usd) as costo, SUM(CASE WHEN estimado THEN 1 ELSE 0 END) as estimadas")
            ->groupBy('provider', 'model')->orderByDesc('tokens')->get()
            ->map(fn ($r) => [
                'provider' => $r->provider, 'model' => $r->model,
                'llamadas' => (int) $r->llamadas, 'fallos' => (int) $r->fallos,
                'entrada' => (int) $r->entrada, 'salida' => (int) $r->salida, 'cache' => (int) $r->cache,
                'tokens' => (int) $r->tokens, 'costo_usd' => round((float) $r->costo, 4),
                'gratis' => in_array($r->provider, $gratis, true), 'estimadas' => (int) $r->estimadas,
            ]);

        $porDia = $base()
            ->selectRaw("DATE(created_at) as fecha, provider, {$tok} as tokens, SUM(costo_usd) as costo, COUNT(*) as llamadas")
            ->groupBy(DB::raw('DATE(created_at)'), 'provider')->orderBy('fecha')->get()
            ->groupBy('fecha')
            ->map(function ($filas, $fecha) use ($gratis) {
                $d = ['fecha' => (string) $fecha, 'tokens' => 0, 'costo_usd' => 0.0, 'costo_real_usd' => 0.0, 'llamadas' => 0];
                foreach ($filas as $f) {
                    $d[$f->provider] = (int) $f->tokens;
                    $d['tokens']    += (int) $f->tokens;
                    $d['llamadas']  += (int) $f->llamadas;
                    $d['costo_usd'] += (float) $f->costo;
                    if (! in_array($f->provider, $gratis, true)) {
                        $d['costo_real_usd'] += (float) $f->costo;
                    }
                }
                $d['costo_usd'] = round($d['costo_usd'], 4);
                $d['costo_real_usd'] = round($d['costo_real_usd'], 4);

                return $d;
            })->values();

        $porProposito = $base()
            ->selectRaw("proposito, COUNT(*) as llamadas, {$tok} as tokens, SUM(costo_usd) as costo")
            ->groupBy('proposito')->orderByDesc('tokens')->get()
            ->map(fn ($r) => ['proposito' => $r->proposito, 'llamadas' => (int) $r->llamadas,
                'tokens' => (int) $r->tokens, 'costo_usd' => round((float) $r->costo, 4)]);

        $topCand = $base()->whereNotNull('candidate_profile_id')
            ->selectRaw("candidate_profile_id as id, COUNT(*) as llamadas, {$tok} as tokens, SUM(costo_usd) as costo")
            ->groupBy('candidate_profile_id')->orderByDesc('tokens')->limit(15)->get();
        $nombres = CandidateProfile::whereIn('id', $topCand->pluck('id'))->pluck('name', 'id');
        $porCandidato = $topCand->map(fn ($r) => [
            'id' => (int) $r->id, 'nombre' => $nombres[$r->id] ?? "Candidato {$r->id}",
            'llamadas' => (int) $r->llamadas, 'tokens' => (int) $r->tokens, 'costo_usd' => round((float) $r->costo, 4),
        ]);

        $hoy = DB::table('ai_usage')->where('created_at', '>=', now()->startOfDay())
            ->selectRaw("provider, {$tok} as tokens, COUNT(*) as llamadas, SUM(CASE WHEN ok THEN 0 ELSE 1 END) as fallos, SUM(costo_usd) as costo")
            ->groupBy('provider')->get()
            ->map(fn ($r) => ['provider' => $r->provider, 'tokens' => (int) $r->tokens, 'llamadas' => (int) $r->llamadas,
                'fallos' => (int) $r->fallos, 'costo_usd' => round((float) $r->costo, 4)]);

        $chat = $base()->where('proposito', 'chat')->where('ok', true)
            ->selectRaw("COUNT(*) as n, {$tok} as tokens, SUM(costo_usd) as costo")->first();

        return response()->json([
            'disponible'     => true,
            'dias'           => $dias,
            'gratis'         => array_values($gratis),
            'groq_tokens_dia'=> (int) config('ai_precios.groq_tokens_dia', 0),
            'totales'        => [
                'tokens'         => (int) $porModelo->sum('tokens'),
                'llamadas'       => (int) $porModelo->sum('llamadas'),
                'fallos'         => (int) $porModelo->sum('fallos'),
                'costo_usd'      => round((float) $porModelo->sum('costo_usd'), 4),
                'costo_real_usd' => round((float) $porModelo->where('gratis', false)->sum('costo_usd'), 4),
            ],
            'por_mensaje'    => [
                'tokens'    => $chat && $chat->n ? (int) round($chat->tokens / $chat->n) : 0,
                'costo_usd' => $chat && $chat->n ? round($chat->costo / $chat->n, 6) : 0,
            ],
            'hoy'            => $hoy,
            'por_modelo'     => $porModelo,
            'por_dia'        => $porDia,
            'por_proposito'  => $porProposito,
            'por_candidato'  => $porCandidato,
        ]);
    }
}
