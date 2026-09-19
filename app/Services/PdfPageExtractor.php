<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use Illuminate\Support\Facades\Storage;
use Smalot\PdfParser\Parser;

/**
 * Extrae el texto de un PDF PÁGINA POR PÁGINA. El número de página es el del
 * visor de PDF (1 = primera hoja), que es el que entiende `archivo.pdf#page=N`;
 * puede diferir del número impreso en la hoja.
 *
 * Una sola fuente de verdad para el job de procesamiento y para el backfill, de
 * modo que `content` (lo que indexa FULLTEXT) y `pages` (lo que se cita) salen
 * siempre del mismo texto.
 */
class PdfPageExtractor
{
    /** Tope de caracteres por documento — igual que el límite histórico de `content`. */
    public const MAX_CHARS = 80000;

    /**
     * @return array{content: string, pages: array<int, string>}
     *         `pages[i]` es la página i+1 (las hojas sin texto quedan como '' para no
     *         desplazar la numeración). `pages` es [] si el parser no separó páginas.
     */
    public function fromBytes(string $raw): array
    {
        $pdf = (new Parser())->parseContent($raw);

        $pages = [];
        $used  = 0;
        foreach ($pdf->getPages() as $page) {
            $text = $this->normalize($page->getText());

            if ($used + mb_strlen($text) > self::MAX_CHARS) {
                $text = mb_substr($text, 0, max(0, self::MAX_CHARS - $used));
            }

            $pages[] = $text;
            $used   += mb_strlen($text);

            if ($used >= self::MAX_CHARS) {
                break;
            }
        }

        $content = trim(implode(' ', array_filter($pages, fn (string $t) => $t !== '')));

        if ($content === '') {
            // El parser no pudo separar páginas (o todas salieron vacías): último
            // recurso, el texto global como antes. Sin páginas no habrá "pág. N".
            $content = mb_substr($this->normalize($pdf->getText()), 0, self::MAX_CHARS);
            $pages   = [];
        }

        return ['content' => $content, 'pages' => $pages];
    }

    /**
     * Lee el PDF desde el disco de media (MEDIA_DISK) como bytes, no por ruta
     * local: el job puede correr en un worker distinto al que recibió el upload y
     * en producción el disco es S3/R2.
     *
     * @return array{content: string, pages: array<int, string>}
     */
    public function fromDocument(KnowledgeDocument $doc): array
    {
        $disk         = config('filesystems.media');
        $base         = Storage::disk($disk)->url('');
        $relativePath = ltrim(str_replace($base, '', (string) $doc->file_url), '/');

        $raw = Storage::disk($disk)->get($relativePath);
        if ($raw === null) {
            throw new \RuntimeException("Archivo no encontrado en el disco '{$disk}': {$relativePath}");
        }

        return $this->fromBytes($raw);
    }

    private function normalize(?string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', (string) $text));
    }
}
