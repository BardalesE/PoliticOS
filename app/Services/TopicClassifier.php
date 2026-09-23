<?php

namespace App\Services;

use App\Models\Topic;

/**
 * Clasifica un mensaje ciudadano en UN tema para las métricas
 * ("¿de qué pregunta la gente?").
 *
 * Por qué existe: `chat_messages.topic` salía NULL (→ "general") en ~75 % de
 * las respuestas. Causas:
 *   1. CivicAIService::detectTopic() usa solo las keywords que el admin cargó
 *      en `topics` y por SUBCADENA ("ia" de Tecnología matchea "historia",
 *      "sol" de Economía matchea "solución") → falsos positivos y, por
 *      primer-match, temas equivocados.
 *   2. Sin tildes/variantes: "educacion" no matchea "educación".
 *   3. El `tema_dominante` de PEPA usa un enum fijo (…|otro) que no coincide
 *      con los temas del tenant: "otro" se guardaba como tema.
 *   4. Preguntas de seguimiento ("¿y cuánto cuesta eso?") no heredan el tema.
 *   5. Preguntas sobre el candidato mismo ("¿quién es?", "¿qué estudió?") no
 *      tenían categoría, y son justamente lo que el candidato quiere medir.
 *
 * Alcance: SOLO la etiqueta que se guarda para analytics. No cambia el $topic
 * que CivicAIService usa para filtrar el RAG y los medios (eso sigue igual a
 * propósito para no alterar la calidad de respuesta).
 */
class TopicClassifier
{
    /** Categoría propia: preguntas sobre la persona/trayectoria del candidato. */
    public const PERFIL = 'candidato'; // se muestra como "Candidato" en el panel

    /**
     * Léxico base (sin tildes, minúsculas). Se suma a las keywords del admin
     * SOLO para los temas que el tenant tiene activos, así el tema devuelto
     * siempre existe en su tabla `topics` (label, emoji, color).
     */
    private const BASE_LEXICON = [
        'seguridad'    => ['seguridad', 'inseguridad', 'delincuencia', 'delincuente', 'delincuentes', 'robo', 'robos', 'asalto', 'asaltos', 'ladron', 'ladrones', 'crimen', 'criminalidad', 'sicario', 'sicarios', 'sicariato', 'extorsion', 'extorsiones', 'extorsionadores', 'policia', 'policias', 'comisaria', 'serenazgo', 'serenos', 'patrullaje', 'camaras de seguridad', 'pandilla', 'pandillas', 'rondas campesinas', 'ronderos', 'violencia', 'homicidio', 'homicidios', 'cogoteo', 'marcas'],
        'economia'     => ['economia', 'economico', 'empleo', 'empleos', 'trabajo', 'trabajos', 'desempleo', 'chamba', 'sueldo', 'sueldos', 'salario', 'salarios', 'impuesto', 'impuestos', 'mype', 'mypes', 'pymes', 'emprendimiento', 'emprendedores', 'negocio', 'negocios', 'comercio', 'mercado', 'mercados', 'inversion', 'inversiones', 'precios', 'inflacion', 'canasta', 'turismo', 'presupuesto', 'formalizacion', 'credito', 'creditos'],
        'empleo'       => ['empleo', 'empleos', 'trabajo', 'desempleo', 'chamba', 'sueldo', 'salario', 'primer empleo', 'bolsa de trabajo'],
        'salud'        => ['salud', 'hospital', 'hospitales', 'posta', 'postas', 'centro de salud', 'medico', 'medicos', 'doctor', 'doctores', 'enfermera', 'enfermeras', 'medicina', 'medicinas', 'medicamento', 'medicamentos', 'sis', 'essalud', 'minsa', 'ambulancia', 'ambulancias', 'anemia', 'desnutricion', 'dengue', 'vacuna', 'vacunas', 'clinica'],
        'educacion'    => ['educacion', 'educativo', 'educativa', 'colegio', 'colegios', 'escuela', 'escuelas', 'universidad', 'universidades', 'instituto', 'institutos', 'profesor', 'profesores', 'maestro', 'maestros', 'docente', 'docentes', 'alumno', 'alumnos', 'estudiante', 'estudiantes', 'beca', 'becas', 'aulas', 'ugel', 'inicial', 'primaria', 'secundaria'],
        'agua'         => ['agua', 'agua potable', 'desague', 'desagues', 'alcantarillado', 'saneamiento', 'cisterna', 'cisternas', 'reservorio', 'reservorios', 'pozo', 'pozos', 'sequia', 'escasez de agua', 'epsel', 'sedalib', 'sedapal', 'jass'],
        'transporte'   => ['transporte', 'carretera', 'carreteras', 'pista', 'pistas', 'vereda', 'veredas', 'asfaltado', 'asfalto', 'pavimentacion', 'trocha', 'trochas', 'camino', 'caminos', 'puente', 'puentes', 'trafico', 'mototaxi', 'mototaxis', 'combi', 'combis', 'vias', 'vial', 'peaje'],
        'carreteras'   => ['carretera', 'carreteras', 'pista', 'pistas', 'trocha', 'trochas', 'asfaltado', 'pavimentacion', 'puente', 'puentes', 'camino', 'caminos'],
        'vivienda'     => ['vivienda', 'viviendas', 'casa', 'casas', 'techo propio', 'mivivienda', 'terreno', 'terrenos', 'lote', 'lotes', 'titulacion', 'titulo de propiedad', 'invasion', 'asentamiento humano', 'habilitacion urbana', 'catastro'],
        'agricultura'  => ['agricultura', 'agricola', 'agricultor', 'agricultores', 'agro', 'agrario', 'campo', 'campesino', 'campesinos', 'chacra', 'chacras', 'cosecha', 'cosechas', 'siembra', 'sembrar', 'cultivo', 'cultivos', 'riego', 'canal de riego', 'canales', 'fertilizante', 'fertilizantes', 'urea', 'abono', 'ganaderia', 'ganado', 'ganaderos', 'arroz', 'mango', 'palta', 'cafe', 'cacao', 'agroexportacion', 'junta de usuarios'],
        'corrupcion'   => ['corrupcion', 'corrupto', 'corruptos', 'coima', 'coimas', 'soborno', 'sobornos', 'malversacion', 'peculado', 'colusion', 'contraloria', 'fiscalia', 'transparencia', 'rendicion de cuentas', 'robaron', 'lavado de activos'],
        'mineria'      => ['mineria', 'minera', 'mineras', 'minero', 'mineros', 'mina', 'minas', 'canon', 'canon minero', 'regalias', 'mineria ilegal', 'reinfo', 'relave', 'relaves'],
        'ambiente'     => ['ambiente', 'medio ambiente', 'contaminacion', 'basura', 'residuos', 'relleno sanitario', 'reciclaje', 'arboles', 'reforestacion', 'rio contaminado', 'cambio climatico'],
        'tecnologia'   => ['tecnologia', 'tecnologico', 'internet', 'wifi', 'conectividad', 'digital', 'digitalizacion', 'inteligencia artificial', 'computadoras', 'celulares', 'fibra optica', 'gobierno digital', 'tramite virtual', 'tramites virtuales'],
        'juventud'     => ['joven', 'jovenes', 'juventud', 'juvenil', 'deporte', 'deportes', 'losa deportiva', 'losas deportivas', 'estadio', 'recreacion'],
        'mujer'        => ['mujer', 'mujeres', 'feminicidio', 'violencia familiar', 'violencia contra la mujer', 'madres', 'vaso de leche', 'comedores populares', 'wawa wasi', 'cuna mas'],
        'pension'      => ['pension', 'pensiones', 'jubilacion', 'jubilados', 'adulto mayor', 'adultos mayores', 'pension 65', 'onp', 'afp'],
        'narcotrafico' => ['narcotrafico', 'droga', 'drogas', 'cocaina', 'microcomercializacion', 'narcos'],
        'congreso'     => ['congreso', 'congresista', 'congresistas', 'parlamento', 'vacancia', 'reforma politica'],
        'cultura'      => ['cultura', 'cultural', 'patrimonio cultural', 'museo', 'fiesta patronal', 'festividad', 'artesania', 'danza', 'musica'],
    ];

    /** Preguntas sobre el candidato como persona — categoría propia. */
    private const PERFIL_LEXICON = [
        'quien es', 'quien eres', 'quienes son', 'hoja de vida', 'trayectoria', 'experiencia', 'estudios', 'profesion',
        'biografia', 'curriculum', 'de donde es', 'cuantos anos tiene', 'edad', 'familia', 'partido', 'partido politico',
        'antecedentes', 'denuncias', 'sentencias', 'patrimonio', 'bienes', 'que ha hecho', 'logros', 'gestion anterior',
        'fue alcalde', 'fue regidor', 'fue consejero',
    ];

    /** Cortesías: nunca heredan el tema anterior. */
    private const SMALL_TALK = [
        'hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'gracias', 'muchas gracias', 'ok', 'okay',
        'vale', 'listo', 'chau', 'adios', 'si', 'no', 'bien', 'genial', 'perfecto', 'entendido',
    ];

    /** Sinónimos del enum de PEPA → nombre de tema real del tenant. */
    private const ALIASES = [
        'empleo'     => ['empleo', 'economia'],
        'economia'   => ['economia', 'empleo'],
        'carreteras' => ['carreteras', 'transporte'],
        'transporte' => ['transporte', 'carreteras'],
        'agua'       => ['agua'],
    ];

    /** Palabras sin carga temática: un mensaje que solo tiene esto es "seguimiento". */
    private const FOLLOW_UP_MAX_WORDS = 8;

    /** @var array<string, array<string, string[]>> memo por tenant (una carga por request) */
    private static array $mapCache = [];

    /**
     * Tema del mensaje o null si no se puede determinar con evidencia.
     * Orden: keywords (tenant + base) → tema_dominante válido de la IA → PERFIL
     * → tema del turno anterior si es una pregunta corta de seguimiento.
     */
    public function classify(string $message, ?string $aiTopic = null, ?string $previousTopic = null): ?string
    {
        return $this->classifyUsing($this->topicMap(), $message, $aiTopic, $previousTopic);
    }

    /** @param array<string, string[]> $map tema => keywords (inyectable para tests) */
    public function classifyUsing(array $map, string $message, ?string $aiTopic = null, ?string $previousTopic = null): ?string
    {

        $topic = self::classifyWith($map, $message)
            ?? $this->resolveAiTopic($aiTopic, array_keys($map));

        if ($topic !== null) {
            return $topic;
        }

        if (self::matchesAny(self::normalize($message), self::PERFIL_LEXICON)) {
            return self::PERFIL;
        }

        if ($previousTopic !== null
            && !in_array(self::normalize($message), self::SMALL_TALK, true)
            && self::wordCount($message) <= self::FOLLOW_UP_MAX_WORDS) {
            return $previousTopic;
        }

        return null;
    }

    /**
     * Núcleo puro (testeable sin BD). Puntúa cada tema por coincidencias de
     * palabra completa, sin tildes; las frases de varias palabras pesan doble.
     * Empate → el primero del mapa (sort_order del admin).
     *
     * @param array<string, string[]> $map tema => keywords
     */
    public static function classifyWith(array $map, string $message): ?string
    {
        $text = self::normalize($message);
        if ($text === '') {
            return null;
        }

        $best = null;
        $bestScore = 0;
        foreach ($map as $topic => $keywords) {
            $score = 0;
            foreach ($keywords as $kw) {
                $kw = self::normalize((string) $kw);
                if ($kw !== '' && self::containsWord($text, $kw)) {
                    $score += str_contains($kw, ' ') ? 2 : 1;
                }
            }
            if ($score > $bestScore) {
                $best = $topic;
                $bestScore = $score;
            }
        }

        return $best;
    }

    /**
     * Acepta el tema propuesto por la IA solo si existe en el tenant
     * (directo o vía alias). "otro", "general" o inventos → null.
     *
     * @param string[] $tenantTopics
     */
    public function resolveAiTopic(?string $aiTopic, array $tenantTopics): ?string
    {
        $slug = self::normalize((string) $aiTopic);
        if ($slug === '' || in_array($slug, ['otro', 'otros', 'general', 'ninguno', 'null'], true)) {
            return null;
        }

        foreach (self::ALIASES[$slug] ?? [$slug] as $candidate) {
            if (in_array($candidate, $tenantTopics, true)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * tema => keywords normalizadas. Temas activos del tenant con sus keywords
     * + el léxico base del mismo nombre. Si el tenant no tiene temas cargados,
     * se usa el léxico base completo (mejor métrica que "general" para todo).
     *
     * @return array<string, string[]>
     */
    public function topicMap(): array
    {
        $key = TenantContext::currentSlug() ?? '__default__';
        if (isset(self::$mapCache[$key])) {
            return self::$mapCache[$key];
        }

        try {
            $tenant = Topic::activeKeywordsMap();
        } catch (\Throwable) {
            $tenant = [];
        }

        if ($tenant === []) {
            return self::$mapCache[$key] = self::BASE_LEXICON;
        }

        $map = [];
        foreach ($tenant as $name => $keywords) {
            $map[$name] = array_values(array_unique(array_merge(
                array_map(fn ($k) => self::normalize((string) $k), (array) $keywords),
                self::BASE_LEXICON[$name] ?? [],
                [self::normalize((string) $name)],
            )));
        }

        return self::$mapCache[$key] = $map;
    }

    public static function flushCache(): void
    {
        self::$mapCache = [];
    }

    public static function normalize(string $text): string
    {
        $text = mb_strtolower(trim($text));
        $text = strtr($text, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u',
            'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'ñ' => 'n',
        ]);
        // Puntuación → espacio; colapsa espacios.
        $text = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text) ?? $text;

        return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
    }

    private static function containsWord(string $normalizedText, string $normalizedKw): bool
    {
        return str_contains(" {$normalizedText} ", " {$normalizedKw} ");
    }

    /** @param string[] $keywords */
    private static function matchesAny(string $normalizedText, array $keywords): bool
    {
        foreach ($keywords as $kw) {
            if (self::containsWord($normalizedText, $kw)) {
                return true;
            }
        }

        return false;
    }

    private static function wordCount(string $message): int
    {
        $n = self::normalize($message);

        return $n === '' ? 0 : count(explode(' ', $n));
    }
}
