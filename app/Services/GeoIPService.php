<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Resuelve IP a geolocalización.
 *
 * Estrategia:
 *   1. Si existe MaxMind GeoLite2 local (config), úsalo (offline, gratis).
 *   2. Sino, ip-api.com (gratis, 45 req/min) con cache de 24h.
 *   3. Si ambos fallan, devuelve nulls.
 *
 * Para IPs de Perú, enriquece con provincia y distrito usando el
 * UBIGEO local (database/data/peru_ubigeo.json).
 */
class GeoIPService
{
    /** @var array<string, array<string, array<string, string>>>|null */
    private static ?array $ubigeo = null;

    public function resolve(string $ip): array
    {
        $empty = [
            'country'  => null,
            'region'   => null,
            'province' => null,
            'city'     => null,
            'district' => null,
            'lat'      => null,
            'lng'      => null,
        ];

        if (in_array($ip, ['127.0.0.1', '::1', '0.0.0.0', 'localhost'], true)) {
            return $empty;
        }

        return Cache::remember("geoip:v2:$ip", 86400, function () use ($ip, $empty) {
            $loc = $this->resolveFromSource($ip);
            if (!$loc) {
                return $empty;
            }

            // Enriquecer con UBIGEO si es Perú
            if ($loc['country'] === 'PE' && $loc['region'] && $loc['city']) {
                [$province, $district] = $this->lookupUbigeo($loc['region'], $loc['city']);
                $loc['province'] = $province;
                $loc['district'] = $district ?? $loc['city']; // city como fallback de distrito
            } else {
                $loc['province'] = null;
                $loc['district'] = $loc['city']; // para países sin UBIGEO usamos city
            }

            return $loc;
        });
    }

    private function resolveFromSource(string $ip): ?array
    {
        // MaxMind GeoLite2 si está configurado
        $mmdbPath = config('services.geoip.maxmind_path');
        if ($mmdbPath && class_exists('\GeoIp2\Database\Reader') && file_exists($mmdbPath)) {
            try {
                $reader = new \GeoIp2\Database\Reader($mmdbPath);
                $rec = $reader->city($ip);
                return [
                    'country' => $rec->country->isoCode,
                    'region'  => $rec->mostSpecificSubdivision->name,
                    'city'    => $rec->city->name,
                    'lat'     => $rec->location->latitude,
                    'lng'     => $rec->location->longitude,
                ];
            } catch (\Throwable $e) {
                Log::warning('MaxMind lookup failed', ['ip' => $ip, 'error' => $e->getMessage()]);
            }
        }

        // Fallback: ip-api.com
        try {
            $r = Http::timeout(3)->get(
                "http://ip-api.com/json/{$ip}?fields=status,country,countryCode,regionName,city,lat,lon"
            );
            if ($r->ok() && $r->json('status') === 'success') {
                return [
                    'country' => $r->json('countryCode'),
                    'region'  => $r->json('regionName'),
                    'city'    => $r->json('city'),
                    'lat'     => $r->json('lat'),
                    'lng'     => $r->json('lon'),
                ];
            }
        } catch (\Throwable $e) {
            Log::warning('ip-api.com lookup failed', ['ip' => $ip, 'error' => $e->getMessage()]);
        }

        return null;
    }

    /**
     * Busca provincia y distrito en el UBIGEO peruano.
     * Primero intenta match exacto, luego match parcial (case-insensitive, sin tildes).
     *
     * @return array{0: string|null, 1: string|null}  [provincia, distrito]
     */
    private function lookupUbigeo(string $department, string $city): array
    {
        $ubigeo = $this->loadUbigeo();

        // Normalizar departamento
        $deptKey = $this->findKey($ubigeo, $department);
        if ($deptKey === null) {
            return [null, null];
        }

        $cities = $ubigeo[$deptKey];

        // Match exacto
        if (isset($cities[$city])) {
            $e = $cities[$city];
            return [$e['provincia'], $e['distrito']];
        }

        // Match case-insensitive
        $cityLower = mb_strtolower($city);
        foreach ($cities as $key => $entry) {
            if (mb_strtolower($key) === $cityLower) {
                return [$entry['provincia'], $entry['distrito']];
            }
        }

        // Match parcial normalizado
        $cityNorm = $this->normalize($city);
        foreach ($cities as $key => $entry) {
            $keyNorm = $this->normalize($key);
            if (str_contains($cityNorm, $keyNorm) || str_contains($keyNorm, $cityNorm)) {
                return [$entry['provincia'], $entry['distrito']];
            }
        }

        return [null, null];
    }

    /** Busca una key en el mapa usando comparación normalizada. */
    private function findKey(array $map, string $search): ?string
    {
        if (isset($map[$search])) {
            return $search;
        }

        $searchNorm = $this->normalize($search);
        foreach (array_keys($map) as $key) {
            if ($this->normalize($key) === $searchNorm) {
                return $key;
            }
        }

        return null;
    }

    /** Normaliza string: minúsculas + sin tildes para comparación robusta. */
    private function normalize(string $s): string
    {
        $s = mb_strtolower($s);
        return str_replace(
            ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', 'à', 'è', 'ì', 'ò', 'ù'],
            ['a', 'e', 'i', 'o', 'u', 'u', 'n', 'a', 'e', 'i', 'o', 'u'],
            $s
        );
    }

    /** Carga el UBIGEO desde disco (singleton en memoria por request). */
    private function loadUbigeo(): array
    {
        if (self::$ubigeo !== null) {
            return self::$ubigeo;
        }

        $path = database_path('data/peru_ubigeo.json');
        if (!file_exists($path)) {
            self::$ubigeo = [];
            return [];
        }

        $data = json_decode(file_get_contents($path), true) ?? [];
        unset($data['_info']);
        self::$ubigeo = $data;

        return self::$ubigeo;
    }

    public static function detectDevice(?string $userAgent): string
    {
        if (!$userAgent) return 'unknown';
        $ua = strtolower($userAgent);

        if (preg_match('/bot|crawler|spider|crawling|googlebot|bingbot/i', $ua)) {
            return 'bot';
        }
        if (preg_match('/mobile|android|iphone|ipod|blackberry|windows phone/i', $ua)) {
            return 'mobile';
        }
        if (preg_match('/ipad|tablet/i', $ua)) {
            return 'tablet';
        }
        return 'desktop';
    }
}
