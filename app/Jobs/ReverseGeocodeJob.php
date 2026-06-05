<?php

namespace App\Jobs;

use App\Models\CitizenProfile;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Convierte lat/lng a dirección aproximada usando Nominatim (OpenStreetMap).
 * Sin API key. Límite: 1 req/segundo — se despacha afterResponse para no bloquear.
 */
class ReverseGeocodeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 2;
    public int $timeout = 15;

    public function __construct(
        public int   $citizenProfileId,
        public float $lat,
        public float $lng
    ) {}

    public function handle(): void
    {
        $citizen = CitizenProfile::find($this->citizenProfileId);
        if (!$citizen || $citizen->location_geocoded_at) return;

        try {
            $response = Http::timeout(10)
                ->withHeaders(['User-Agent' => 'PoliticOS/1.0 (info@politicos.pe)'])
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'lat'            => $this->lat,
                    'lon'            => $this->lng,
                    'format'         => 'json',
                    'addressdetails' => 1,
                    'accept-language'=> 'es',
                ]);

            if (!$response->ok()) return;

            $data = $response->json();
            $addr = $data['address'] ?? [];

            // Mapeo para Perú: district → province → department
            $district   = $addr['city_district'] ?? $addr['suburb'] ?? $addr['quarter']
                       ?? $addr['town']          ?? $addr['village'] ?? null;
            $province   = $addr['county']  ?? $addr['city']   ?? $addr['municipality'] ?? null;
            $department = $addr['state']   ?? $addr['region'] ?? null;
            $address    = mb_substr($data['display_name'] ?? '', 0, 500);

            $citizen->update([
                'location_district'   => $district   ? mb_substr($district,   0, 100) : null,
                'location_province'   => $province   ? mb_substr($province,   0, 100) : null,
                'location_department' => $department ? mb_substr($department, 0, 100) : null,
                'location_address'    => $address    ?: null,
                'location_geocoded_at'=> now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('ReverseGeocodeJob failed', [
                'citizen_id' => $this->citizenProfileId,
                'error'      => $e->getMessage(),
            ]);
        }
    }
}
