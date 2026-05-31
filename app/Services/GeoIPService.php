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
 */
class GeoIPService
{
    public function resolve(string $ip): array
    {
        $empty = [
            'country' => null, 'region' => null, 'city' => null,
            'lat' => null, 'lng' => null,
        ];

        if (in_array($ip, ['127.0.0.1','::1','0.0.0.0','localhost'], true)) {
            return $empty;
        }

        return Cache::remember("geoip:$ip", 86400, function () use ($ip, $empty) {
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
                    Log::warning('MaxMind lookup failed', ['ip'=>$ip,'error'=>$e->getMessage()]);
                }
            }

            // Fallback: ip-api.com
            try {
                $r = Http::timeout(3)->get("http://ip-api.com/json/{$ip}?fields=status,country,countryCode,regionName,city,lat,lon");
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
                Log::warning('ip-api.com lookup failed', ['ip'=>$ip,'error'=>$e->getMessage()]);
            }

            return $empty;
        });
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
