<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\VisitorProfile;
use App\Services\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Análisis estructurado de mensajes ciudadanos.
 * Extrae: sentimiento, emoción, intención, preocupaciones,
 * distrito mencionado, propuestas ciudadanas, problemas específicos.
 * Sin API externa — todo basado en reglas.
 */
class AnalyzeMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 1;
    public int $timeout = 15;

    public function __construct(public int $messageId, public ?string $tenantSlug = null)
    {
        $this->tenantSlug ??= TenantContext::currentSlug();
    }

    public function handle(): void
    {
        TenantContext::run($this->tenantSlug, fn () => $this->process());
    }

    private function process(): void
    {
        $message = ChatMessage::find($this->messageId);
        if (!$message || $message->role !== 'user') return;

        $analysis = $this->analyze($message->content);
        if (!$analysis) return;

        $message->update([
            'sentiment'          => $analysis['sentiment'],
            'emotion'            => $analysis['emotion'],
            'intent'             => $analysis['intent'],
            'concerns'           => $analysis['concerns'],
            'district_mentioned' => $analysis['district_mentioned'],
            'proposals_detected' => $analysis['proposals_detected'] ?: null,
            'problems_mentioned' => $analysis['problems_mentioned'] ?: null,
            'attack_detected'    => $analysis['is_attack'],
            'attack_category'    => $analysis['attack_category'],
            'analysis_raw'       => $analysis,
        ]);

        $this->updateSession($message->session_id, $analysis);
        $this->updateVisitor($message, $analysis);

        // Clustering cada 30 mensajes ciudadanos.
        // Va a la cola Redis: el slug debe viajar explícito o el worker
        // clusterizaría sobre la DB por defecto.
        $userMsgCount = ChatMessage::where('role', 'user')->count();
        if ($userMsgCount > 0 && $userMsgCount % 30 === 0) {
            ClusterTopQuestionsJob::dispatch($this->tenantSlug)->delay(now()->addSeconds(10));
        }
    }

    // ─── Análisis principal ──────────────────────────────────────────────────

    private function analyze(string $content): ?array
    {
        $text = mb_strtolower($content);

        $sentiment = $this->scoreSentiment($text);
        $emotion   = $this->detectEmotion($text, $sentiment);
        $intent    = $this->detectIntent($text);
        $concerns  = $this->detectConcerns($text);
        $district  = $this->detectDistrict($text);
        $proposals = $this->detectProposals($text);
        $problems  = $this->extractProblems($text, $concerns);
        $isAttack  = $this->isAttack($text, $intent);
        $category  = $isAttack ? $this->attackCategory($text) : null;
        $segment   = $this->detectSegment($text);
        $intention = $this->detectVoterIntention($text);

        return compact('sentiment', 'emotion', 'intent', 'concerns') + [
            'district_mentioned'  => $district,
            'proposals_detected'  => $proposals,
            'problems_mentioned'  => $problems,
            'voter_segment'       => $segment,
            'voter_intention'     => $intention,
            'is_attack'           => $isAttack,
            'attack_category'     => $category,
        ];
    }

    // ─── Sentimiento ────────────────────────────────────────────────────────

    private function scoreSentiment(string $text): float
    {
        $positive = [
            'bien', 'bueno', 'buena', 'excelente', 'apoyo', 'gracias', 'confío', 'espero',
            'mejor', 'progreso', 'éxito', 'favor', 'correcto', 'acuerdo', 'interesante',
            'útil', 'claro', 'ayuda', 'propuesta', 'solución', 'trabajo', 'feliz',
            'contento', 'satisfecho', 'genial', 'bonito', 'importante',
        ];
        $negative = [
            'malo', 'pésimo', 'corrupto', 'mentira', 'fraude', 'robo', 'ladrón',
            'terrible', 'horrible', 'inútil', 'problema', 'fracaso', 'nunca', 'jamás',
            'desastre', 'engaño', 'incapaz', 'peor', 'miedo', 'preocupa', 'falta',
            'no hay', 'olvidado', 'abandonado', 'sin agua', 'sin luz', 'sin pista',
        ];
        $score = 0.0;
        foreach ($positive as $w) { if (str_contains($text, $w)) $score += 0.15; }
        foreach ($negative as $w) { if (str_contains($text, $w)) $score -= 0.15; }
        return max(-1.0, min(1.0, $score));
    }

    // ─── Emoción ────────────────────────────────────────────────────────────

    private function detectEmotion(string $text, float $sentiment): string
    {
        if (preg_match('/\bmiedo\b|\bpreocup|\btemor\b|\bnervios/u', $text))      return 'miedo';
        if (preg_match('/\bfrust|\bcansan|\bharto\b|\beno[jg]|\bhastiado/u', $text)) return 'frustracion';
        if (preg_match('/\bescándalo|\bcorrupt|\bladrón|\bfraude|\brabia/u', $text)) return 'enojo';
        if (preg_match('/\besper|\bconfi|\bfuturo|\bsueño|\bprogres|\boptim/u', $text)) return 'esperanza';
        if (preg_match('/\bgrac|\bfelici|\bgenial|\bexcel|\bcontento/u', $text))   return 'alegria';
        return $sentiment < -0.2 ? 'frustracion' : ($sentiment > 0.2 ? 'esperanza' : 'neutral');
    }

    // ─── Intención ──────────────────────────────────────────────────────────

    private function detectIntent(string $text): string
    {
        if (preg_match('/\?|¿|qué|cómo|cuándo|dónde|cuánto|por qué|porqué|cuál/u', $text)) return 'pregunta';
        if (preg_match('/\bfraude|\bmentira|\bcorrupt|\bno creo|\bno sirve/u', $text)) return 'ataque';
        if (preg_match('/\bcritc|\bmalo\b|\bpésimo|\bno es|\bnunca ha/u', $text))    return 'critica';
        if (preg_match('/\bapoyo|\bvoto\s*por|\bconfío|\badelante|\bsuerte/u', $text)) return 'apoyo';
        if (preg_match('/\bpropongo|\bsugiero|\bsería bueno|\bdeberían|\bme gustaría/u', $text)) return 'propuesta';
        if (preg_match('/\bhola|\bbuenas|\bsaludo|\bbuen día/u', $text)) return 'saludo';
        if (preg_match('/\bno\s+(sé|estoy|entiendo|me convence)\b/u', $text)) return 'duda';
        return 'otro';
    }

    // ─── Preocupaciones (categorías amplias) ────────────────────────────────

    private function detectConcerns(string $text): array
    {
        $map = [
            'empleo'     => ['trabajo', 'empleo', 'desempleo', 'salario', 'sueldo', 'ingreso', 'chamba', 'bono', 'microempresa'],
            'seguridad'  => ['seguridad', 'robo', 'delito', 'crimen', 'policía', 'violencia', 'pandilla', 'extorsión', 'ronda'],
            'salud'      => ['salud', 'hospital', 'médico', 'enfermedad', 'medicina', 'seguro', 'posta', 'farmacia', 'ambulancia'],
            'educacion'  => ['educación', 'escuela', 'colegio', 'universidad', 'profesor', 'estudio', 'beca', 'tecnología'],
            'agua'       => ['agua', 'saneamiento', 'desagüe', 'alcantarillado', 'potable', 'cisterna', 'pozo'],
            'carreteras' => ['carretera', 'pista', 'camino', 'vía', 'transporte', 'asfalto', 'trocha', 'puente', 'acceso'],
            'agricultura'=> ['campo', 'agricultor', 'cosecha', 'chacra', 'cultivo', 'granja', 'abono', 'fertilizante', 'canales'],
            'corrupcion' => ['corrupto', 'corrupción', 'fraude', 'robo', 'malversación', 'coima', 'soborno'],
            'vivienda'   => ['vivienda', 'casa', 'techo', 'alquiler', 'terreno', 'construcción', 'invasión'],
            'economia'   => ['precio', 'inflación', 'caro', 'dinero', 'deuda', 'impuesto', 'economía', 'costo'],
        ];
        $found = [];
        foreach ($map as $concern => $keywords) {
            foreach ($keywords as $kw) {
                if (str_contains($text, $kw)) { $found[] = $concern; break; }
            }
        }
        return array_slice(array_unique($found), 0, 4);
    }

    // ─── Distrito mencionado ────────────────────────────────────────────────

    private function detectDistrict(string $text): ?string
    {
        // Mapa de distritos con sus variantes de escritura
        $districts = [
            'San Miguel'     => ['san miguel', 'sanmiguel'],
            'San Gregorio'   => ['san gregorio', 'sangregorio'],
            'Calquis'        => ['calquis'],
            'Catilluc'       => ['catilluc'],
            'El Prado'       => ['el prado', 'prado'],
            'La Florida'     => ['la florida', 'florida'],
            'Llapa'          => ['llapa'],
            'Nanchoc'        => ['nanchoc'],
            'Niepos'         => ['niepos'],
            'San Silvestre'  => ['san silvestre'],
            'Cochán'         => ['cochán', 'cochan'],
            'Tongod'         => ['tongod'],
            'Lima'           => ['lima', 'capital'],
            'Cajamarca'      => ['cajamarca'],
            'Chiclayo'       => ['chiclayo'],
            'Trujillo'       => ['trujillo'],
            'Arequipa'       => ['arequipa'],
            'Cusco'          => ['cusco', 'cuzco'],
            'Piura'          => ['piura'],
        ];

        foreach ($districts as $name => $variants) {
            foreach ($variants as $variant) {
                if (str_contains($text, $variant)) return $name;
            }
        }
        return null;
    }

    // ─── Propuestas del ciudadano ───────────────────────────────────────────

    private function detectProposals(string $text): array
    {
        $triggerPhrases = [
            'sería bueno', 'sería mejor', 'debería', 'deberían', 'propongo', 'propongo que',
            'sugiero', 'me gustaría', 'quisiera que', 'necesitamos que', 'pido que',
            'exijo que', 'hace falta', 'falta un', 'falta una', 'no hay pero debería',
            'por qué no', 'podrían hacer', 'podrían implementar',
        ];

        $proposals = [];
        $sentences = preg_split('/[.!?;]+/u', $text);
        foreach ($sentences as $sentence) {
            $sentence = trim($sentence);
            if (!$sentence) continue;
            foreach ($triggerPhrases as $phrase) {
                if (str_contains($sentence, $phrase)) {
                    $proposals[] = mb_substr(ucfirst(trim($sentence)), 0, 200);
                    break;
                }
            }
        }
        return array_values(array_unique(array_slice($proposals, 0, 3)));
    }

    // ─── Problemas específicos ──────────────────────────────────────────────

    private function extractProblems(string $text, array $concerns): array
    {
        $problems = [];
        $problemPhrases = [
            'no tenemos', 'no hay', 'falta', 'faltan', 'no funciona', 'no funcional',
            'está roto', 'está abandonado', 'no llega', 'no alcanza', 'sin acceso',
            'no podemos', 'sufrimos', 'padecemos', 'afecta', 'perjudica', 'daña',
        ];

        $sentences = preg_split('/[.!?;]+/u', $text);
        foreach ($sentences as $sentence) {
            $sentence = trim(mb_strtolower($sentence));
            if (!$sentence) continue;
            foreach ($problemPhrases as $phrase) {
                if (str_contains($sentence, $phrase)) {
                    $problems[] = mb_substr(ucfirst(trim($sentence)), 0, 200);
                    break;
                }
            }
        }

        // Si hay preocupaciones detectadas, añadir como problema genérico si no se extrajo nada específico
        if (empty($problems) && !empty($concerns)) {
            foreach ($concerns as $concern) {
                $problems[] = "Mención de problemática: {$concern}";
            }
        }

        return array_values(array_unique(array_slice($problems, 0, 3)));
    }

    // ─── Detección de ataques ───────────────────────────────────────────────

    private function isAttack(string $text, string $intent): bool
    {
        return $intent === 'ataque' ||
            (bool) preg_match('/\bladrón|\bcorrupt|\bfraude|\bmentiroso|\bimpostor|\bengañ/u', $text);
    }

    private function attackCategory(string $text): ?string
    {
        if (preg_match('/\bhistorial|\bpasado|\bantes\b|\banterior/u', $text)) return 'pasado';
        if (preg_match('/\bpartido|\bcampaña|\bcandidato|\bgrupo/u', $text))   return 'partido';
        if (preg_match('/\bpropuesta|\bplan|\bproyecto|\bpromesa/u', $text))   return 'propuesta';
        return 'personal';
    }

    // ─── Segmento y intención del votante ──────────────────────────────────

    private function detectSegment(string $text): string
    {
        if (preg_match('/\bestudiant|\buniversidad|\bcolegio\b|\bjoven|\begresado/u', $text)) return 'joven';
        if (preg_match('/\bagricultor|\bcampo|\bchacra|\bcosecha|\bganadero/u', $text))      return 'agricultor';
        if (preg_match('/\bempresa|\bnegocio|\bcomercio|\bempresario|\bmype/u', $text))      return 'empresario';
        if (preg_match('/\btrabajador|\bsindic|\bobreros|\bjornalero/u', $text))             return 'trabajador';
        if (preg_match('/\bpensión|\bjubilado|\badulto mayor|\bpensionista/u', $text))       return 'adulto_mayor';
        return 'desconocido';
    }

    private function detectVoterIntention(string $text): string
    {
        if (preg_match('/\bapoyo\s*total|\bseguro\s*(que)?\s*voto|\bvoto\s*(por|a)\s+\w+/u', $text)) return 'alta';
        if (preg_match('/\bno\s*(voto|apoyo)|\boposit|\bnunca\s*voto|\bno\s*me\s*convence/u', $text)) return 'opositor';
        if (preg_match('/\bquizás|\bdepende|\baún\s*no\s*(sé|decido)|\bestoy\s*evaluando/u', $text))  return 'indeciso';
        if (preg_match('/\bprobablemente|\bcreo\s*que\s*sí|\bme\s*parece\s*bien/u', $text))           return 'media';
        return 'desconocido';
    }

    // ─── Actualización de sesión ────────────────────────────────────────────

    private function updateSession(int $sessionId, array $analysis): void
    {
        $session = ChatSession::find($sessionId);
        if (!$session) return;

        $avgSent = ChatMessage::where('session_id', $sessionId)
            ->where('role', 'user')->whereNotNull('sentiment')->avg('sentiment');

        $updates = [
            'avg_sentiment'  => $avgSent ? round((float) $avgSent, 2) : null,
            'messages_count' => ChatMessage::where('session_id', $sessionId)->count(),
        ];

        if (!empty($analysis['voter_segment']) && $analysis['voter_segment'] !== 'desconocido') {
            $updates['inferred_segment'] = $analysis['voter_segment'];
        }
        if (!empty($analysis['voter_intention']) && $analysis['voter_intention'] !== 'desconocido') {
            $updates['inferred_intention'] = $analysis['voter_intention'];
        }
        if (!empty($analysis['district_mentioned']) && empty($session->geo_city)) {
            $updates['geo_city'] = $analysis['district_mentioned'];
        }

        $session->update($updates);
    }

    // ─── Actualización del perfil de visitante ─────────────────────────────

    private function updateVisitor(ChatMessage $message, array $analysis): void
    {
        $session = $message->session;
        if (!$session || !$session->visitor_uuid) return;

        $profile = VisitorProfile::firstOrCreate(
            ['visitor_uuid' => $session->visitor_uuid],
            ['first_seen_at' => now()]
        );

        $existingConcerns = $profile->detected_concerns ?? [];
        $allConcerns = array_unique(array_merge($existingConcerns, $analysis['concerns'] ?? []));

        $updates = [
            'detected_concerns' => array_values(array_slice($allConcerns, -10)),
            'total_messages'    => ($profile->total_messages ?? 0) + 1,
            'last_seen_at'      => now(),
            'avg_sentiment'     => $session->avg_sentiment,
        ];

        if (!empty($analysis['voter_segment']) && $analysis['voter_segment'] !== 'desconocido') {
            $updates['inferred_segment'] = $analysis['voter_segment'];
        }
        if (!empty($analysis['voter_intention']) && $analysis['voter_intention'] !== 'desconocido') {
            $updates['inferred_intention'] = $analysis['voter_intention'];
        }
        if (!empty($analysis['district_mentioned'])) {
            $updates['inferred_district'] = $analysis['district_mentioned'];
        }

        $profile->update($updates);
    }
}
