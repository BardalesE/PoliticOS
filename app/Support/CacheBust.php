<?php

namespace App\Support;

class CacheBust
{
    /**
     * Anexa un parámetro de versión (?v=timestamp / &v=timestamp) a una URL,
     * para que reemplazar el archivo en la misma ruta (logo, foto, video del
     * hero) invalide el caché del navegador/CDN sin depender de su TTL —
     * `next.config.js` cachea imágenes hasta 24h (`minimumCacheTTL`). Solo se
     * usa en endpoints PÚBLICOS de lectura: los endpoints de admin devuelven
     * la URL canónica sin tocar, para que el formulario de edición nunca
     * guarde de vuelta una URL con `?v=` pegado.
     */
    public static function url(?string $url, ?\DateTimeInterface $version): ?string
    {
        if (!$url || !$version) return $url;

        $separator = str_contains($url, '?') ? '&' : '?';
        return "{$url}{$separator}v={$version->getTimestamp()}";
    }
}
