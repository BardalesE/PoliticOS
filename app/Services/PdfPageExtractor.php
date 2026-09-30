<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use Illuminate\Support\Facades\Storage;
use Smalot\PdfParser\Parser;

/**
 * Extrae el texto de un PDF PAGINA POR PAGINA. El numero de pagina es el del
 * visor de PDF (1 = primera hoja), que es el que entiende `archivo.pdf#page=N`.
 *
 * Motor principal: `pdftotext -layout` (poppler-utils, instalado en el
 * Dockerfile). Respeta el orden visual de la hoja, asi que cada etiqueta queda
 * junto a su valor ("GRADO O TITULO: SOCIOLOGIA"). smalot/pdfparser, en cambio,
 * saca en formularios como la hoja de vida del JNE primero TODAS las etiquetas
 * y al final los valores: el recorte de 1200 caracteres que ve la IA quedaba
 * solo con etiquetas y la IA respondia "el fragmento no muestra los datos".
 *
 * Si pdftotext no esta disponible (p. ej. Laragon en Windows) o falla, se usa
 * smalot como antes: nada se rompe, solo se pierde el orden visual.
 */
class PdfPageExtractor
{
    /** Cierra el bloque de casillas: el RAG lo separa del texto para no recortarlo nunca. */
    public const FIN_CASILLAS = '[FIN CASILLAS]';

    /** Tope de caracteres por documento. */
    public const MAX_CHARS = 80000;

    /**
     * @return array{content: string, pages: array<int, string>}
     *         `pages[i]` es la pagina i+1 (hojas sin texto quedan como '').
     */
    public function fromBytes(string $raw): array
    {
        $rawPages = $this->pagesViaPdftotext($raw);
        $pdf      = null;

        if ($rawPages === null) {
            $pdf      = (new Parser())->parseContent($raw);
            $rawPages = array_map(fn ($p) => (string) $p->getText(), $pdf->getPages());
        }

        // Hoja de vida del JNE: las marcas de sus casillas no son texto. Se detectan
        // aparte y se anteponen a cada página (antes de la sección patrimonial, que
        // SensitiveData recorta hasta el final de la página).
        if ($this->esHojaDeVidaJne($rawPages)) {
            $casillas = $this->casillasMarcadas($raw);
            if ($casillas !== null) {
                foreach ($rawPages as $i => $texto) {
                    if (! empty($casillas[$i])) {
                        $rawPages[$i] = self::bloqueCasillas($casillas[$i]) . "\n" . $texto;
                    }
                }
            }
        }

        $pages = [];
        $used  = 0;
        foreach ($rawPages as $pageText) {
            $text = $this->normalize($pageText);

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
            // Ultimo recurso: texto global de smalot, sin paginas.
            $pdf ??= (new Parser())->parseContent($raw);
            $content = mb_substr($this->normalize($pdf->getText()), 0, self::MAX_CHARS);
            $pages   = [];
        }

        return ['content' => $content, 'pages' => $pages];
    }

    /**
     * Lee el PDF desde el disco de media (MEDIA_DISK) como bytes.
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

    /** Prefijo que la IA recibe con las casillas marcadas de la página. */
    public static function bloqueCasillas(array $marcadas): string
    {
        return 'CASILLAS MARCADAS EN ESTA PÁGINA (leídas del PDF; las opciones no listadas NO están marcadas): '
            . implode(' | ', $marcadas) . ' ' . self::FIN_CASILLAS;
    }

    /** @param array<int, string> $pages */
    private function esHojaDeVidaJne(array $pages): bool
    {
        // -layout parte el título en dos líneas ("DECLARACIÓN\n  JURADA"): se colapsan espacios.
        $inicio = mb_strtoupper((string) preg_replace('/\s+/u', ' ', mb_substr(implode(' ', array_slice($pages, 0, 1)), 0, 4000)));

        return str_contains($inicio, 'HOJA DE VIDA')
            && (str_contains($inicio, 'DECLARACIÓN JURADA') || str_contains($inicio, 'DECLARACION JURADA'));
    }

    /**
     * Casillas marcadas por página con resources/scripts/hv_casillas.py
     * (PyMuPDF). null si no hay Python/PyMuPDF (p. ej. Laragon): se sigue sin ellas.
     *
     * @return array<int, array<int, string>>|null
     */
    private function casillasMarcadas(string $raw): ?array
    {
        $script = base_path('resources/scripts/hv_casillas.py');
        if (! function_exists('proc_open') || ! is_file($script)) {
            return null;
        }

        $tmp = tempnam(sys_get_temp_dir(), 'hv');
        if ($tmp === false) {
            return null;
        }

        try {
            file_put_contents($tmp, $raw);
            $proc = @proc_open(
                ['timeout', '30', 'python3', $script, $tmp],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes
            );
            if (! is_resource($proc)) {
                return null;
            }
            $out = (string) stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            if (proc_close($proc) !== 0) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        } finally {
            @unlink($tmp);
        }

        $data = json_decode($out, true);

        return is_array($data['pages'] ?? null) ? $data['pages'] : null;
    }

    /**
     * Texto por pagina con `pdftotext -layout`, o null si no se puede usar.
     * Sin shell (proc_open con array): el nombre del archivo nunca se interpreta.
     *
     * @return array<int, string>|null
     */
    private function pagesViaPdftotext(string $raw): ?array
    {
        if (! function_exists('proc_open')) {
            return null;
        }

        $tmp = tempnam(sys_get_temp_dir(), 'pdf');
        if ($tmp === false) {
            return null;
        }

        try {
            file_put_contents($tmp, $raw);

            $proc = @proc_open(
                ['pdftotext', '-layout', '-enc', 'UTF-8', $tmp, '-'],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes
            );
            if (! is_resource($proc)) {
                return null;
            }

            $out = (string) stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            fclose($pipes[2]);

            if (proc_close($proc) !== 0 || trim($out) === '') {
                return null;
            }
        } catch (\Throwable) {
            return null;
        } finally {
            @unlink($tmp);
        }

        // pdftotext separa paginas con form feed y deja uno al final.
        $pages = explode("\f", $out);
        if (count($pages) > 1 && trim((string) end($pages)) === '') {
            array_pop($pages);
        }

        return $pages;
    }

    private function normalize(?string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', (string) $text));
    }
}
