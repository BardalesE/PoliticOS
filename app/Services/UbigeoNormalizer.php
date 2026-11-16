<?php

namespace App\Services;

use App\Models\UbigeoDepartamento;
use App\Models\UbigeoDistrito;
use App\Models\UbigeoProvincia;

/**
 * Normaliza menciones de región en texto libre (lo que Groq extrae en
 * "regiones_mencionadas" durante el MAP) contra el ubigeo del tenant, para que
 * ReduceDocumentJob pueda agrupar `propuestas_por_region` por un id real en
 * vez de por el string tal cual lo escribió el LLM ("San Miguel" vs "san
 * miguel" vs "distrito de San Miguel").
 *
 * Match exacto por nombre normalizado (sin tildes, sin mayúsculas, espacios
 * colapsados) a nivel distrito → provincia → departamento. Sin match, la
 * mención queda tal cual (nivel=null): mejor conservarla sin asociar que
 * inventarle un ubigeo.
 */
class UbigeoNormalizer
{
    /**
     * @param array<int, string> $mentions
     * @return array<int, array{mencion:string, nivel:?string, nombre_normalizado:?string,
     *                           departamento_id:?int, provincia_id:?int, distrito_id:?int}>
     */
    public function normalize(array $mentions): array
    {
        $distritos = UbigeoDistrito::all(['id', 'distrito', 'provincia_id', 'departamento_id'])
            ->keyBy(fn ($d) => $this->normalizeKey($d->distrito));
        $provincias = UbigeoProvincia::all(['id', 'provincia', 'departamento_id'])
            ->keyBy(fn ($p) => $this->normalizeKey($p->provincia));
        $departamentos = UbigeoDepartamento::all(['id', 'departamento'])
            ->keyBy(fn ($d) => $this->normalizeKey($d->departamento));

        $out  = [];
        $seen = [];
        foreach ($mentions as $mention) {
            $key = $this->normalizeKey($mention);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            if ($d = $distritos->get($key)) {
                $out[] = $this->row($mention, 'distrito', $d->distrito, $d->departamento_id, $d->provincia_id, $d->id);
            } elseif ($p = $provincias->get($key)) {
                $out[] = $this->row($mention, 'provincia', $p->provincia, $p->departamento_id, $p->id, null);
            } elseif ($dep = $departamentos->get($key)) {
                $out[] = $this->row($mention, 'departamento', $dep->departamento, $dep->id, null, null);
            } else {
                $out[] = $this->row($mention, null, null, null, null, null);
            }
        }

        return $out;
    }

    private function row(string $mention, ?string $nivel, ?string $nombre, ?int $depId, ?int $provId, ?int $distId): array
    {
        return [
            'mencion'             => $mention,
            'nivel'               => $nivel,
            'nombre_normalizado'  => $nombre,
            'departamento_id'     => $depId,
            'provincia_id'        => $provId,
            'distrito_id'         => $distId,
        ];
    }

    private function normalizeKey(string $value): string
    {
        $value = mb_strtolower(trim($value), 'UTF-8');
        $value = strtr($value, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n']);

        return (string) preg_replace('/\s+/', ' ', $value);
    }
}
