<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * Datos clave de una Hoja de Vida del JNE, leídos de forma DETERMINISTA del texto
 * por página (con su bloque "CASILLAS MARCADAS…").
 *
 * Por qué (auditoría Monzón 2026-09-30): el chat solo ve 1-4 páginas por pregunta.
 * Si la pregunta traía la página 1 y no la 2, el modelo veía "CARGOS DE ELECCIÓN
 * POPULAR: SÍ TENGO" sin el detalle y respondía "no declara cargos de elección",
 * contradiciendo otra respuesta que sí decía "regidor distrital 2022-2026". También
 * calculaba mal la edad. Con esto el modelo recibe SIEMPRE los mismos hechos.
 *
 * Nunca incluye DNI, domicilio, ingresos, bienes ni acciones (ver SensitiveData).
 */
final class HojaDeVidaDatosClave
{
    /**
     * @param  array<int,string>  $pages  texto por página tal como lo guarda KnowledgeDocument::pages
     * @return array<int,string>  líneas "Etiqueta: valor" (vacío si no parece una HV del JNE)
     */
    public static function desdePaginas(array $pages, ?CarbonImmutable $hoy = null): array
    {
        $texto = preg_replace('/\s+/u', ' ', implode(' ', array_map('strval', $pages)));
        if ($texto === '' || ! str_contains($texto, 'HOJA DE VIDA')) {
            return [];
        }

        $casillas = self::casillas($pages);
        $hoy    ??= CarbonImmutable::now('America/Lima');
        $out      = [];

        // ── Nacimiento ────────────────────────────────────────────────
        if (preg_match('~FECHA DE NACIMIENTO \(dd/mm/aaaa\) \(\d\):\s*(\d{2})/(\d{2})/(\d{4})~u', $texto, $m)) {
            try {
                $nac   = CarbonImmutable::createFromDate((int) $m[3], (int) $m[2], (int) $m[1], 'America/Lima')->startOfDay();
                $edad  = (int) $nac->diffInYears($hoy->startOfDay(), true);
                $out[] = "Fecha de nacimiento: {$m[1]}/{$m[2]}/{$m[3]} (tiene {$edad} años hoy)";
            } catch (\Throwable) {
                // fecha inválida: se omite
            }
        }
        if (preg_match('/LUGAR DE NACIMIENTO \(\d\)\s*PAÍS:\s*(.+?)\s*DEPARTAMENTO:\s*(.*?)\s*PROVINCIA:\s*(.*?)\s*DISTRITO:\s*(.*?)\s*LUGAR DE DOMICILIO/u', $texto, $m)) {
            $lugar = array_filter([self::lindo($m[4]), self::lindo($m[3]), self::lindo($m[2])]);
            $pais  = self::lindo($m[1]);
            $out[] = 'Lugar de nacimiento: ' . ($lugar ? implode(', ', $lugar) . ($pais && $pais !== 'Perú' && $pais !== 'Peru' ? " ({$pais})" : '') : $pais);
        }

        if (! $casillas) {
            return $out;   // HV sin casillas leídas: solo lo que es texto plano
        }

        // ── Formación ─────────────────────────────────────────────────
        $basica = [];
        $nivel  = null;
        foreach ($casillas as $c) {
            if (preg_match('/ESTUDIOS (PRIMARIOS|SECUNDARIOS)\?:\s*(SÍ|NO)$/u', $c, $m)) {
                $nivel = $m[1] === 'PRIMARIOS' ? 'primaria' : 'secundaria';
                $basica[$nivel] = $m[2] === 'SÍ' ? 'sí' : 'no';
            } elseif ($nivel && preg_match('/CONCLUIDOS:\s*(SÍ|NO)$/u', $c, $m)) {
                if ($basica[$nivel] === 'sí') {
                    $basica[$nivel] = $m[1] === 'SÍ' ? 'completa' : 'incompleta';
                }
                $nivel = null;
            }
        }
        if ($basica) {
            $out[] = 'Educación básica: ' . implode('; ', array_map(
                fn ($n, $v) => $v === 'no' ? "sin {$n}" : "{$n} {$v}",
                array_keys($basica), $basica,
            ));
        }
        foreach ([
            'ESTUDIOS NO UNIVERSITARIOS' => 'Estudios técnicos / no universitarios',
            'ESTUDIOS UNIVERSITARIOS'    => 'Estudios universitarios',
            'ESTUDIOS DE POSGRADO'       => 'Posgrado',
        ] as $clave => $etiqueta) {
            if (($v = self::respuesta($casillas, $clave)) !== null) {
                $detalle = $clave === 'ESTUDIOS UNIVERSITARIOS' ? self::universidades($texto) : '';
                $out[] = "{$etiqueta}: " . ($v ? ($detalle ?: 'SÍ declara (el detalle está en la hoja de vida)') : 'no declara');
            }
        }

        // ── Experiencia y trayectoria ─────────────────────────────────
        if (($v = self::respuesta($casillas, 'II. EXPERIENCIA DE TRABAJO')) !== null) {
            $out[] = 'Experiencia laboral de los últimos 10 años (sección II): '
                . ($v ? (self::experiencias($texto) ?: 'SÍ declara (el detalle está en la hoja de vida)') : 'no declara ninguna');
        }
        if (($v = self::respuesta($casillas, 'CARGOS PARTIDARIOS')) !== null) {
            $out[] = 'Cargos partidarios: ' . ($v ? (self::cargosPartidarios($texto) ?: 'SÍ declara (el detalle está en la hoja de vida)') : 'no declara');
        }
        $eleccion = self::cargosDeEleccion($casillas, $texto);
        if ($eleccion !== null) {
            $out[] = 'Cargos de elección popular que ya ocupó (sección IV): ' . ($eleccion ?: 'no declara ninguno');
        }

        // ── Sentencias y renuncias ────────────────────────────────────
        if (($v = self::respuesta($casillas, 'V. RELACIÓN DE SENTENCIAS')) !== null) {
            $out[] = 'Sentencias condenatorias firmes por delito doloso (sección V): '
                . ($v ? 'SÍ declara (lee el fallo en la hoja de vida)' : 'no declara');
        }
        if (($v = self::respuesta($casillas, 'VI. RELACIÓN DE SENTENCIAS')) !== null) {
            $out[] = 'Sentencias por obligaciones familiares, alimentarias, contractuales, laborales o violencia familiar (sección VI): '
                . ($v ? 'SÍ declara (lee el detalle en la hoja de vida)' : 'no declara');
        }
        if (($v = self::respuesta($casillas, 'VII. MENCIÓN DE LAS RENUNCIAS')) !== null) {
            $out[] = 'Renuncias a otros partidos (sección VII): ' . ($v ? (self::renuncias($texto) ?: 'SÍ declara') : 'no declara');
        }

        return $out;
    }

    private static function anio(string $s): string
    {
        $s = trim($s);

        return preg_match('/^[\d ]{4,7}$/u', $s) ? str_replace(' ', '', $s) : mb_strtolower($s);
    }

    /** "Bachiller en Administracion de Empresas, Universidad de Lima (concluido, 1977)" */
    private static function universidades(string $t): string
    {
        preg_match_all('/NOMBRE DE LA UNIVERSIDAD:\s*(.+?)\s*CONCLUIDOS:\s*(SÍ|NO)\s*GRADO O TÍTULO:\s*(.*?)\s*EGRESADO:.{0,40}?OBTENCIÓN:\s*(\d{4})?/u', $t, $mm, PREG_SET_ORDER);
        $out = [];
        foreach (array_slice($mm, 0, 3) as $m) {
            $grado = trim($m[3]) !== '' ? self::lindo($m[3]) . ', ' : '';
            $out[] = $grado . self::lindo($m[1]) . ' (' . ($m[2] === 'SÍ' ? 'concluido' : 'no concluido') . (! empty($m[4]) ? ", {$m[4]}" : '') . ')';
        }

        return implode('; ', $out);
    }

    /** "Empresario en Red Bicolor de Comunicaciones S.A.A. (1986–2016)". Sin RUC ni dirección. */
    private static function experiencias(string $t): string
    {
        preg_match_all('/NOMBRE DEL CENTRO DE PRESTACIÓN DEL SERVICIO O TRABAJO:\s*(.+?)\s*OFICIOS \/ OCUPACIONES \/ PROFESIONES:\s*(.+?)\s*RUC.{0,160}?DESDE \(AÑO\):\s*([\d ]{4,7})\s*HASTA \(AÑO\):\s*(HASTA LA ACTUALIDAD|[\d ]{4,7})/u', $t, $mm, PREG_SET_ORDER);
        $out = [];
        foreach (array_slice($mm, 0, 5) as $m) {
            $out[] = self::lindo($m[2]) . ' en ' . self::lindo($m[1]) . ' (' . self::anio($m[3]) . '–' . self::anio($m[4]) . ')';
        }

        return implode('; ', $out);
    }

    /** "Fundador de Partido Civico Obras (2022–hasta la actualidad)" */
    private static function cargosPartidarios(string $t): string
    {
        // El texto del formulario (no el bloque de casillas, que también dice "CARGOS PARTIDARIOS").
        $ini = mb_strpos($t, 'últimos cargos partidarios');
        $fin = mb_strpos($t, 'CARGOS DE ELECCIÓN POPULAR', $ini === false ? 0 : $ini + 1);
        if ($ini === false) {
            return '';
        }
        $tramo = mb_substr($t, $ini, $fin !== false ? $fin - $ini : 2000);
        preg_match_all('/ORGANIZACIÓN POLÍTICA\s*:\s*(.+?)\s*CARGO:\s*(.+?)\s*DESDE \(AÑO\):\s*([\d ]{4,7})\s*HASTA \(AÑO\):\s*(HASTA LA ACTUALIDAD|[\d ]{4,7})/u', $tramo, $mm, PREG_SET_ORDER);
        $out = [];
        foreach (array_slice($mm, 0, 3) as $m) {
            $out[] = self::lindo($m[2]) . ' de ' . self::lindo($m[1]) . ' (' . self::anio($m[3]) . '–' . self::anio($m[4]) . ')';
        }

        return implode('; ', $out);
    }

    /** "Union por el Peru (2021)" */
    private static function renuncias(string $t): string
    {
        preg_match_all('/ORGANIZACIÓN POLÍTICA A LA QUE RENUNCIÓ:\s*(.+?)\s*HASTA \(Opcional\):\s*([\d ]{4,7})?/u', $t, $mm, PREG_SET_ORDER);
        $out = [];
        foreach (array_slice($mm, 0, 3) as $m) {
            $out[] = self::lindo($m[1]) . (! empty($m[2]) ? ' (' . self::anio($m[2]) . ')' : '');
        }

        return implode('; ', $out);
    }

    /** @return array<int,string> casillas marcadas de todas las páginas, en orden */
    private static function casillas(array $pages): array
    {
        $todas = [];
        foreach ($pages as $p) {
            if (preg_match('/^CASILLAS MARCADAS[^:]*?\):\s*(.*?)\s*\[FIN CASILLAS\]/su', (string) $p, $m)) {
                foreach (explode(' | ', $m[1]) as $c) {
                    if (($c = trim($c)) !== '') {
                        $todas[] = $c;
                    }
                }
            }
        }

        return $todas;
    }

    /** true = "SÍ TENGO"/"SÍ", false = "NO TENGO"/"NO", null = casilla no leída. */
    private static function respuesta(array $casillas, string $prefijo): ?bool
    {
        foreach ($casillas as $c) {
            if (! str_starts_with($c, $prefijo)) {
                continue;
            }
            if (preg_match('/:\s*(SÍ TENGO|NO TENGO|SÍ|NO)$/u', $c, $m)) {
                return str_starts_with($m[1], 'SÍ');
            }
        }

        return null;
    }

    /**
     * "Regidor(a) distrital 2022–2026 (Frente Regional de Cajamarca)"; '' = declara que no;
     * null = no se leyó la casilla.
     */
    private static function cargosDeEleccion(array $casillas, string $texto): ?string
    {
        $tiene = self::respuesta($casillas, 'CARGOS DE ELECCIÓN POPULAR — ¿TENGO');
        $cargos = [];
        foreach ($casillas as $c) {
            if (preg_match('/CARGO (\d+):\s*(.+)$/u', $c, $m)) {
                $cargos[(int) $m[1]] = mb_strtolower($m[2]);
            }
        }
        if ($tiene === false) {
            return '';
        }
        if (! $cargos) {
            return $tiene === null ? null : 'SÍ declara (el detalle está en la hoja de vida)';
        }

        // Organización y años de cada cargo: bloque "CARGO n. (Marque…" hasta la sección V.
        $ini   = mb_strpos($texto, 'CARGO 1. (Marque');
        $fin   = mb_strpos($texto, 'V. RELACIÓN DE SENTENCIAS');
        $tramo = $ini === false ? '' : mb_substr($texto, $ini, $fin !== false && $fin > $ini ? $fin - $ini : null);
        preg_match_all('/ORGANIZACIÓN POLÍTICA:\s*(.+?)\s*DESDE \(AÑO\):\s*([\d ]{4,7}?)\s*HASTA \(AÑO\):\s*([\d ]{4,7})/u', $tramo, $mm, PREG_SET_ORDER);

        $partes = [];
        foreach (array_values($cargos) as $i => $cargo) {
            $cargo = mb_strtoupper(mb_substr($cargo, 0, 1)) . mb_substr($cargo, 1);
            if (isset($mm[$i])) {
                $desde = str_replace(' ', '', $mm[$i][2]);
                $hasta = str_replace(' ', '', $mm[$i][3]);
                $partes[] = "{$cargo} {$desde}–{$hasta}, por " . self::lindo($mm[$i][1]);
            } else {
                $partes[] = $cargo;
            }
        }

        return implode('; ', $partes);
    }

    /** "SAN GREGORIO" → "San Gregorio" */
    private static function lindo(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return '';
        }
        $w = explode(' ', mb_strtolower($s));
        foreach ($w as $i => $x) {
            if (str_contains($x, '.')) {
                $w[$i] = mb_strtoupper($x);   // siglas: S.A.A., L.I.N°
            } elseif ($i === 0 || ! in_array($x, ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'el', 'por', 'al', 'a'], true)) {
                $w[$i] = mb_strtoupper(mb_substr($x, 0, 1)) . mb_substr($x, 1);
            }
        }

        return implode(' ', $w);
    }
}
