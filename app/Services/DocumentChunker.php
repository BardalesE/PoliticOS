<?php

namespace App\Services;

/**
 * Divide el texto por página de un documento (`PdfPageExtractor::fromBytes()['pages']`)
 * en chunks para el pipeline MAP/REDUCE:
 *
 *   1. Detecta secciones por títulos (EJE/CAPÍTULO/SECCIÓN/TÍTULO + numeración,
 *      o una frase en MAYÚSCULAS seguida de texto normal). El texto sin título
 *      detectado (portada, intro) queda como una sección sin `titulo` (null).
 *   2. Cada sección se subdivide en chunks de ~N tokens con solape, para no
 *      mandar secciones gigantes de una sola vez a Groq.
 *
 * Cada palabra del documento queda etiquetada con su página de origen desde el
 * principio: así `page_start`/`page_end` de cualquier chunk (incluso tras
 * dividir una sección grande) son exactos, nunca aproximados por offset de
 * caracteres. Invariante: todo el texto de toda página queda dentro de algún
 * chunk (ninguna página se pierde, aunque quede vacía de contenido real).
 */
class DocumentChunker
{
    private const KEYWORD_PATTERN = '/\b(EJE|CAP[IÍ]TULO|SECCI[OÓ]N|T[IÍ]TULO)\s+([IVXLCDM]+|\d+)(\s*[:.\-–]\s*[A-ZÁÉÍÓÚÑ0-9][^.]{0,80})?/u';

    // Frase en mayúsculas (2-8 palabras) al inicio de página o tras un punto,
    // seguida de texto normal ("Capitalizada minúscula"): patrón típico de un
    // título de sección pegado al cuerpo por la normalización sin saltos de línea.
    private const ALLCAPS_PATTERN = '/(?:^|[.!?]\s+)((?:[A-ZÁÉÍÓÚÑ0-9]{2,}[ \-]){1,7}[A-ZÁÉÍÓÚÑ0-9]{2,})(?=\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/u';

    public function __construct(
        private readonly int $fallbackTokens = 1500,
        private readonly int $overlapTokens  = 200,
    ) {
    }

    /**
     * @param array<int, string> $pages índice 0 = página 1 (igual que PdfPageExtractor).
     * @return array<int, array{orden:int, titulo:?string, texto:string, page_start:int, page_end:int, tokens:int}>
     */
    public function chunk(array $pages): array
    {
        $sections = $this->detectSections($pages);

        // ~1.3 tokens por palabra en español (aproximación deliberada: no hay
        // tokenizer real disponible aquí, y no lo necesitamos con esta precisión).
        $wordsPerChunk = max(50, (int) round($this->fallbackTokens / 1.3));
        $overlapWords  = max(0, (int) round($this->overlapTokens / 1.3));

        $chunks = [];
        $orden  = 0;
        foreach ($sections as $section) {
            foreach ($this->splitWords($section['words'], $wordsPerChunk, $overlapWords) as $piece) {
                $chunks[] = [
                    'orden'      => $orden++,
                    'titulo'     => $section['titulo'],
                    'texto'      => implode(' ', array_column($piece, 'w')),
                    'page_start' => min(array_column($piece, 'page')),
                    'page_end'   => max(array_column($piece, 'page')),
                    'tokens'     => (int) round(count($piece) * 1.3),
                ];
            }
        }

        return $chunks;
    }

    /**
     * @return array<int, array{titulo: ?string, words: array<int, array{w:string, page:int}>}>
     */
    private function detectSections(array $pages): array
    {
        $sections = [];
        $current  = ['titulo' => null, 'words' => []];

        foreach ($pages as $i => $pageText) {
            $pageNum = $i + 1;
            if (trim((string) $pageText) === '') {
                continue; // nada que perder: página sin texto.
            }

            $headings = $this->findHeadings($pageText);
            if (empty($headings)) {
                $this->appendWords($current['words'], $pageText, $pageNum);
                continue;
            }

            $pos = 0;
            foreach ($headings as $h) {
                $before = trim(mb_substr($pageText, $pos, $h['offset'] - $pos));
                if ($before !== '') {
                    $this->appendWords($current['words'], $before, $pageNum);
                }
                if (!empty($current['words'])) {
                    $sections[] = $current;
                }
                $current = ['titulo' => $h['titulo'], 'words' => []];
                $pos = $h['offset'];
            }

            $rest = trim(mb_substr($pageText, $pos));
            if ($rest !== '') {
                $this->appendWords($current['words'], $rest, $pageNum);
            }
        }

        if (!empty($current['words'])) {
            $sections[] = $current;
        }

        // Documento sin ninguna sección detectada (ningún heading en todo el
        // PDF): no debería pasar con $sections vacío salvo que todas las
        // páginas estén en blanco.
        return $sections;
    }

    private function appendWords(array &$words, string $text, int $pageNum): void
    {
        foreach (preg_split('/\s+/u', trim($text)) as $w) {
            if ($w !== '') {
                $words[] = ['w' => $w, 'page' => $pageNum];
            }
        }
    }

    /**
     * @param array<int, array{w:string, page:int}> $words
     * @return array<int, array<int, array{w:string, page:int}>>
     */
    private function splitWords(array $words, int $size, int $overlap): array
    {
        if (empty($words)) {
            return [];
        }

        $step = max(1, $size - $overlap);
        $out  = [];
        for ($i = 0; $i < count($words); $i += $step) {
            $out[] = array_slice($words, $i, $size);
            if ($i + $size >= count($words)) {
                break;
            }
        }

        return $out;
    }

    /**
     * @return array<int, array{offset:int, length:int, titulo:string}> ordenado por offset (en CARACTERES,
     *         no bytes — PREG_OFFSET_CAPTURE con /u devuelve bytes, hay que convertir), sin solapes.
     */
    private function findHeadings(string $pageText): array
    {
        $matches = [];

        if (preg_match_all(self::KEYWORD_PATTERN, $pageText, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[0] as $match) {
                $offset = mb_strlen(substr($pageText, 0, $match[1]), 'UTF-8');
                $matches[] = ['offset' => $offset, 'length' => mb_strlen($match[0], 'UTF-8'), 'titulo' => trim($match[0])];
            }
        }

        if (preg_match_all(self::ALLCAPS_PATTERN, $pageText, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[1] as $match) {
                $offset = mb_strlen(substr($pageText, 0, $match[1]), 'UTF-8');
                $matches[] = ['offset' => $offset, 'length' => mb_strlen($match[0], 'UTF-8'), 'titulo' => trim($match[0])];
            }
        }

        usort($matches, fn ($a, $b) => $a['offset'] <=> $b['offset']);

        // Descarta matches que empiecen dentro de otro ya aceptado (solape).
        $out = [];
        $lastEnd = -1;
        foreach ($matches as $m) {
            if ($m['offset'] < $lastEnd) {
                continue;
            }
            $out[] = $m;
            $lastEnd = $m['offset'] + $m['length'];
        }

        return $out;
    }
}
