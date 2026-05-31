<?php

namespace App\Jobs;

use App\Jobs\ClusterTopQuestionsJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\VisitorProfile;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Análisis de sentimiento e intención basado en reglas.
 * No usa ninguna API externa para no competir con el chat principal.
 */
class AnalyzeMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 1;
    public int $timeout = 10;

    public function __construct(public int $messageId) {}

    public function handle(): void
    {
        $message = ChatMessage::find($this->messageId);
        if (!$message || $message->role !== 'user') return;

        $analysis = $this->analyze($message->content);
        if (!$analysis) return;

        $message->update([
            'sentiment'       => $analysis['sentiment'],
            'emotion'         => $analysis['emotion'],
            'intent'          => $analysis['intent'],
            'concerns'        => $analysis['concerns'],
            'attack_detected' => $analysis['is_attack'],
            'attack_category' => $analysis['attack_category'],
            'analysis_raw'    => $analysis,
        ]);

        $this->updateSession($message->session_id, $analysis);
        $this->updateVisitor($message, $analysis);

        $userMsgCount = ChatMessage::where('role', 'user')->count();
        if ($userMsgCount > 0 && $userMsgCount % 30 === 0) {
            ClusterTopQuestionsJob::dispatch()->delay(now()->addSeconds(10));
        }
    }

    // ─── Análisis basado en reglas (sin API externa) ─────────────────────────

    private function analyze(string $content): ?array
    {
        $text = mb_strtolower($content);

        $sentiment = $this->scoreSentiment($text);
        $emotion   = $this->detectEmotion($text, $sentiment);
        $intent    = $this->detectIntent($text);
        $concerns  = $this->detectConcerns($text);
        $isAttack  = $this->isAttack($text, $intent);
        $category  = $isAttack ? $this->attackCategory($text) : null;
        $segment   = $this->detectSegment($text);
        $intention = $this->detectVoterIntention($text);

        return [
            'sentiment'       => $sentiment,
            'emotion'         => $emotion,
            'intent'          => $intent,
            'concerns'        => $concerns,
            'voter_segment'   => $segment,
            'voter_intention' => $intention,
            'is_attack'       => $isAttack,
            'attack_category' => $category,
        ];
    }

    private function scoreSentiment(string $text): float
    {
        $positive = ['bien', 'bueno', 'excelente', 'apoyo', 'gracias', 'confío', 'espero', 'mejor',
                     'progreso', 'éxito', 'favor', 'correcto', 'acuerdo', 'interesante', 'útil',
                     'claro', 'ayuda', 'propuesta', 'solución', 'trabajo'];
        $negative = ['malo', 'pésimo', 'corrupto', 'mentira', 'fraude', 'robo', 'ladrón', 'terrible',
                     'horrible', 'inútil', 'problema', 'fracaso', 'nunca', 'jamás', 'desastre',
                     'engaño', 'incapaz', 'peor', 'miedo', 'preocupa'];

        $score = 0.0;
        foreach ($positive as $w) { if (str_contains($text, $w)) $score += 0.15; }
        foreach ($negative as $w) { if (str_contains($text, $w)) $score -= 0.15; }

        return max(-1.0, min(1.0, $score));
    }

    private function detectEmotion(string $text, float $sentiment): string
    {
        if (preg_match('/\bmiedo\b|\bpreocup|\btemor\b/u', $text))    return 'miedo';
        if (preg_match('/\bfrust|\bcansan|\bharto\b|\beno[jg]/u', $text)) return 'frustracion';
        if (preg_match('/\bescándalo|\bcorrupt|\bladrón|\bfraude/u', $text)) return 'enojo';
        if (preg_match('/\besper|\bconfi|\bfuturo|\bsueño|\bprogres/u', $text)) return 'esperanza';
        if (preg_match('/\bgrac|\bfelici|\bgenial|\bexcel/u', $text))  return 'alegria';
        return $sentiment < -0.2 ? 'frustracion' : ($sentiment > 0.2 ? 'esperanza' : 'neutral');
    }

    private function detectIntent(string $text): string
    {
        if (preg_match('/\?|¿|qué|cómo|cuándo|dónde|cuánto|por qué|porqué|cuál/u', $text)) return 'pregunta';
        if (preg_match('/\bfraude|\bmentira|\bcorrupt|\bno creo|\bno sirve|\bfalsedad/u', $text)) return 'ataque';
        if (preg_match('/\bcritc|\bmalo|\bpésimo|\bno es|\btampoco|\bnunca ha/u', $text)) return 'critica';
        if (preg_match('/\bapoyo|\bvoto\s*por|\bconfío|\badelante|\bsuerte/u', $text)) return 'apoyo';
        if (preg_match('/\bhola|\bbuenas|\bsaludo|\bbuen día/u', $text)) return 'saludo';
        if (preg_match('/\bno\s+(sé|estoy|entiendo|me convence)\b/u', $text)) return 'duda';
        return 'otro';
    }

    private function detectConcerns(string $text): array
    {
        $map = [
            'empleo'    => ['trabajo', 'empleo', 'desempleo', 'salario', 'sueldo', 'ingreso'],
            'seguridad' => ['seguridad', 'robo', 'delito', 'crimen', 'policía', 'violencia'],
            'salud'     => ['salud', 'hospital', 'médico', 'enfermedad', 'medicina', 'seguro'],
            'educacion' => ['educación', 'escuela', 'colegio', 'universidad', 'profesor', 'estudio'],
            'agua'      => ['agua', 'saneamiento', 'desagüe', 'alcantarillado'],
            'carreteras'=> ['carretera', 'pista', 'camino', 'vía', 'transporte', 'asfalto'],
            'agricultura'=> ['campo', 'agricultor', 'cosecha', 'chacra', 'cultivo', 'granja'],
            'corrupcion'=> ['corrupto', 'corrupción', 'fraude', 'robo', 'malversación'],
        ];

        $found = [];
        foreach ($map as $concern => $keywords) {
            foreach ($keywords as $kw) {
                if (str_contains($text, $kw)) { $found[] = $concern; break; }
            }
        }
        return array_slice(array_unique($found), 0, 3);
    }

    private function isAttack(string $text, string $intent): bool
    {
        return $intent === 'ataque' ||
            (bool) preg_match('/\bladrón|\bcorrupt|\bfraude|\bmentiroso|\bimpostor|\bengañ/u', $text);
    }

    private function attackCategory(string $text): ?string
    {
        if (preg_match('/\bhistorial|\bpasado|\bantes\b|\bantes de|\banterior/u', $text)) return 'pasado';
        if (preg_match('/\bpartido|\bcampaña|\bcandidato|\bgrupo/u', $text))               return 'partido';
        if (preg_match('/\bpropuesta|\bplan|\bproyecto|\bpromesa/u', $text))               return 'propuesta';
        return 'personal';
    }

    private function detectSegment(string $text): string
    {
        if (preg_match('/\bestudiant|\buniversidad|\bcolegio\b|\bjoven/u', $text)) return 'joven';
        if (preg_match('/\bagricultor|\bcampo|\bchacra|\bcosecha/u', $text))       return 'agricultor';
        if (preg_match('/\bempresa|\bnegocio|\bcomercio|\bempresario/u', $text))   return 'empresario';
        if (preg_match('/\btrabajador|\bobreros|\bsindicato/u', $text))            return 'trabajador';
        return 'desconocido';
    }

    private function detectVoterIntention(string $text): string
    {
        if (preg_match('/\bvoto\s*(por|a)\s*james|\bapoyo\s*total|\bseguro\s*voto/u', $text)) return 'alta';
        if (preg_match('/\bno\s*(voto|apoyo)|\boposit|\bnunca\s*voto/u', $text))              return 'opositor';
        if (preg_match('/\bquizás|\bdepende|\baún\s*no\s*(sé|decido)/u', $text))              return 'indeciso';
        return 'desconocido';
    }

    // ─── Actualización de sesión y perfil ────────────────────────────────────

    private function updateSession(int $sessionId, array $analysis): void
    {
        $session = ChatSession::find($sessionId);
        if (!$session) return;

        $avgSent = ChatMessage::where('session_id', $sessionId)
            ->where('role', 'user')
            ->whereNotNull('sentiment')->avg('sentiment');

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

        $session->update($updates);
    }

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

        $profile->update($updates);
    }
}
