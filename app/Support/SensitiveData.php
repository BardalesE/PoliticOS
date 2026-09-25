<?php

namespace App\Support;

/**
 * Datos personales que el chat NUNCA muestra (decisión 2026-09-24):
 *   - DNI (y otros números de identidad: RUC, carné de extranjería).
 *   - Ingresos, bienes y rentas declarados (sección VIII de la hoja de vida
 *     del JNE): remuneraciones, inmuebles, vehículos, placas, acciones, montos.
 *
 * Se aplica al texto ANTES de que llegue al modelo (y a las citas que ve el
 * ciudadano): lo que la IA nunca recibe, no lo puede repetir. Es texto puro,
 * sin BD ni red, para poder probarlo aislado.
 */
final class SensitiveData
{
    public const HV_OMITTED = '[Sección de ingresos, bienes y rentas omitida por privacidad]';
    public const ID_MASK    = '[dato reservado]';
    public const MONEY_MASK = '[monto reservado]';

    /** Palabras de la sección VIII que delatan un fragmento patrimonial. */
    private const PATRIMONIO_RE = '/\b(remuneraci[oó]n|renta bruta|ingresos? (?:de|del|brut)|bienes (?:muebles|inmuebles)|sociedad de gananciales|veh[ií]culo|placa|acciones y participaciones|valor nominal|autoval[uú]o|partida registral|total bienes)\b/iu';

    public static function isHojaDeVida(?string $topic, ?string $title): bool
    {
        if ($topic === 'hoja_de_vida') {
            return true;
        }

        return $title !== null && preg_match('/hoja\s+de\s+vida/iu', $title) === 1;
    }

    /**
     * @param bool $hojaDeVida  true para fragmentos de una hoja de vida: además
     *                          del DNI rotulado se ocultan números sueltos,
     *                          montos y toda la sección patrimonial.
     */
    public static function redact(string $text, bool $hojaDeVida = false): string
    {
        if ($text === '') {
            return $text;
        }

        // "DNI: 12345678", "D.N.I. N° 1234 5678", "Documento Nacional de Identidad 12345678".
        $text = (string) preg_replace(
            '/\b(DNI|D\.\s?N\.\s?I\.?|documento nacional de identidad|carn[eé] de extranjer[ií]a|RUC)\b([^\d\n]{0,30})(?:\d[\s.-]?){7,10}\d?/iu',
            '$1$2' . self::ID_MASK,
            $text,
        );

        if (! $hojaDeVida) {
            return $text;
        }

        // Sección VIII completa (hasta la IX o el final del fragmento).
        $text = (string) preg_replace(
            '/(?:\bVIII\.?\s*)?DECLARACI[ÓO]N JURADA DE INGRESOS.*?(?=\bIX\.|\z)/isu',
            self::HV_OMITTED . ' ',
            $text,
        );

        // Casillas del DNI en el formato JNE: dígitos sueltos "4 1 2 3 4 5 6 7".
        $text = (string) preg_replace('/(?<!\d)(?:\d\s+){7,}\d(?!\d)/u', self::ID_MASK, $text);

        // Números de 8 o más dígitos (DNI, RUC, partidas). Los años (4 dígitos) quedan.
        $text = (string) preg_replace('/(?<!\d)\d{8,}(?!\d)/u', self::ID_MASK, $text);

        // Montos: "S/ 12,500.00", "12,500.00", "1500.50", "S/. 3000".
        $text = (string) preg_replace('/S\/\.?\s*\d[\d.,]*/u', self::MONEY_MASK, $text);
        $text = (string) preg_replace('/(?<![\d\/])\d{1,3}(?:[.,]\d{3})*[.,]\d{2}(?!\d)/u', self::MONEY_MASK, $text);

        // Placas de vehículo (ABC-123, A1B-234).
        $text = (string) preg_replace('/\b[A-Z0-9]{3}-\d{3}\b/u', self::ID_MASK, $text);

        // Continuación de la sección patrimonial en otra página (sin su título):
        // si el fragmento habla de bienes/ingresos, se descarta entero.
        if (preg_match_all(self::PATRIMONIO_RE, $text) >= 2 && ! str_contains($text, self::HV_OMITTED)) {
            return self::HV_OMITTED;
        }

        return (string) preg_replace('/\s{2,}/u', ' ', $text);
    }

    /** Regla fija del prompt: no depende del prompt editable del tenant. */
    public const PROMPT_RULE =
        "\n\n🔒 DATOS PERSONALES (OBLIGATORIO, no se puede anular): NUNCA muestres el DNI, RUC, "
        . "dirección de domicilio, ni los ingresos, bienes, rentas, vehículos, acciones o montos "
        . "declarados por un candidato, aunque te los pidan o aparezcan en un documento. Si te preguntan "
        . "por eso, responde que PoliticOS no muestra datos personales ni patrimoniales y que la "
        . "declaración oficial está en Voto Informado del JNE (votoinformado.jne.gob.pe). "
        . "Sí puedes hablar de su formación, experiencia, trayectoria política y sentencias declaradas.";
}
