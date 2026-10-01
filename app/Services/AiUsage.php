<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Registro del consumo de IA: tokens y costo por llamada (2026-10-01).
 * Nunca rompe el chat: cualquier error al guardar se ignora.
 */
final class AiUsage
{
    /** Para qué se llamó a la IA (lo fija quien llama: el control de calidad pone "qa"). */
    public static string $proposito = 'chat';
    public static ?int $candidatoId = null;

    /** Mientras es true, las filas se guardan en memoria (el control de calidad corre en una
     *  transacción que se revierte: sin esto su consumo se perdería). Ver diferir()/volcar(). */
    private static bool $diferir = false;
    private static array $pendientes = [];

    private static array $tablaPorConexion = [];

    public static function diferir(): void
    {
        self::$diferir = true;
        self::$pendientes = [];
    }

    public static function volcar(): void
    {
        self::$diferir = false;
        $filas = self::$pendientes;
        self::$pendientes = [];
        try {
            if ($filas && self::hayTabla()) {
                DB::connection()->table('ai_usage')->insert($filas);
            }
        } catch (\Throwable $e) {
            Log::debug('AiUsage: no se pudo volcar', ['error' => $e->getMessage()]);
        }
    }

    private static function hayTabla(): bool
    {
        $conn = DB::connection();
        $key  = $conn->getName() . '|' . $conn->getDatabaseName();

        return self::$tablaPorConexion[$key] ??= Schema::connection($conn->getName())->hasTable('ai_usage');
    }

    public static function registrar(
        string $provider, ?string $model, int $in, int $out,
        int $cacheRead = 0, int $cacheWrite = 0, bool $estimado = false,
        bool $ok = true, ?int $status = null, ?string $proposito = null,
    ): void {
        try {
            $fila = [
                'provider'             => mb_substr($provider, 0, 20),
                'model'                => $model ? mb_substr($model, 0, 80) : null,
                'proposito'            => mb_substr($proposito ?? self::$proposito, 0, 20),
                'candidate_profile_id' => self::$candidatoId,
                'input_tokens'         => max(0, $in),
                'output_tokens'        => max(0, $out),
                'cache_read_tokens'    => max(0, $cacheRead),
                'cache_write_tokens'   => max(0, $cacheWrite),
                'costo_usd'            => self::costo($provider, $model, $in, $out, $cacheRead, $cacheWrite),
                'estimado'             => $estimado,
                'ok'                   => $ok,
                'http_status'          => $status,
                'created_at'           => now(),
            ];
            if (self::$diferir) {
                self::$pendientes[] = $fila;
                return;
            }
            if (self::hayTabla()) {
                DB::connection()->table('ai_usage')->insert($fila);
            }
        } catch (\Throwable $e) {
            Log::debug('AiUsage: no se pudo registrar', ['error' => $e->getMessage()]);
        }
    }

    public static function fallo(string $provider, ?string $model, ?int $status): void
    {
        self::registrar($provider, $model, 0, 0, ok: false, status: $status);
    }

    /** Costo a precio de lista (USD). */
    public static function costo(string $provider, ?string $model, int $in, int $out, int $cacheRead = 0, int $cacheWrite = 0): float
    {
        $p = self::precio($provider, $model);

        return round((
            $in * $p['in'] + $out * $p['out']
            + $cacheRead * ($p['cache_read'] ?? $p['in']) + $cacheWrite * ($p['cache_write'] ?? $p['in'])
        ) / 1_000_000, 6);
    }

    /** @return array{in: float, out: float, cache_read?: float, cache_write?: float} */
    public static function precio(string $provider, ?string $model): array
    {
        $mejor = null; $largo = -1;
        foreach (config('ai_precios.modelos', []) as $clave => $precio) {
            [$prov, $prefijo] = array_pad(explode(':', $clave, 2), 2, '');
            if ($prov === $provider && str_starts_with((string) $model, $prefijo) && strlen($prefijo) > $largo) {
                $mejor = $precio; $largo = strlen($prefijo);
            }
        }

        return $mejor ?? ['in' => 0, 'out' => 0];
    }

    /** Tokens aproximados de un texto (~4 caracteres por token en español). */
    public static function estimar(string $texto): int
    {
        return (int) ceil(mb_strlen($texto) / 4);
    }
}
