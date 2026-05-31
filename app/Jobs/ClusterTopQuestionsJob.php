<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\QuestionCluster;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Clustering de preguntas frecuentes (job nocturno).
 *
 * Reemplaza el GROUP BY SUBSTRING horrible del AnalyticsController.
 * Estrategia:
 *   1. Toma todas las preguntas user del último día.
 *   2. Las clasifica por topic + concerns ya extraídos por AnalyzeMessageJob.
 *   3. Para cada bucket grande, pide a Groq que genere una etiqueta humana.
 *
 * Output: tabla question_clusters lista para el dashboard.
 */
class ClusterTopQuestionsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 120;

    public function handle(): void
    {
        $date = today();

        // Borrar clusters anteriores del mismo día (idempotente)
        QuestionCluster::where('analyzed_date', $date)->delete();

        // Agrupar por concern principal de los últimos 30 días (acumulado)
        // Excluye mensajes muy cortos (saludos, pruebas de 1-2 palabras)
        $messages = ChatMessage::where('role','user')
            ->where('created_at', '>=', now()->subDays(30))
            ->whereNotNull('concerns')
            ->where('concerns','!=','[]')
            ->whereRaw('CHAR_LENGTH(content) > 10')
            ->get(['id','content','topic','sentiment','concerns']);

        $buckets = [];
        foreach ($messages as $m) {
            $concerns = is_array($m->concerns) ? $m->concerns : json_decode($m->concerns, true) ?? [];
            $primary = $concerns[0] ?? $m->topic ?? 'general';
            $buckets[$primary][] = $m;
        }

        foreach ($buckets as $primary => $msgs) {
            if (count($msgs) < 2) continue; // ignorar buckets de 1 solo mensaje

            $samples = collect($msgs)->take(8)->pluck('content')->all();
            $label = $this->generateLabel($primary, $samples);

            // Elegir la pregunta más representativa: la más larga y significativa (>20 chars)
            $meaningful = array_filter($samples, fn($s) => mb_strlen(trim($s)) > 20);
            $representative = !empty($meaningful)
                ? array_values($meaningful)[0]
                : ($samples[0] ?? '');

            QuestionCluster::create([
                'cluster_label'           => $label,
                'representative_question' => $representative,
                'topic'                   => $msgs[0]->topic ?? null,
                'message_count'           => count($msgs),
                'sample_questions'        => array_slice($samples, 0, 5),
                'sample_message_ids'      => collect($msgs)->take(5)->pluck('id')->all(),
                'avg_sentiment'           => round(collect($msgs)->avg('sentiment') ?? 0, 2),
                'analyzed_date'           => $date,
            ]);
        }
    }

    private function generateLabel(string $primaryConcern, array $samples): string
    {
        $apiKey = config('services.ai.groq_key') ?: config('services.ai.openai_key');
        if (!$apiKey) return ucfirst($primaryConcern);

        $samplesText = implode("\n- ", array_slice($samples, 0, 5));
        $prompt = "Estas son preguntas de ciudadanos peruanos sobre el tema '{$primaryConcern}':\n- {$samplesText}\n\nGenera una etiqueta corta (máx 6 palabras) que describa el patrón común. Solo la etiqueta, sin comillas ni explicación.";

        try {
            $url = config('services.ai.groq_key')
                ? 'https://api.groq.com/openai/v1/chat/completions'
                : 'https://api.openai.com/v1/chat/completions';

            $model = config('services.ai.groq_key') ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';

            $r = Http::timeout(10)->withToken($apiKey)->post($url, [
                'model' => $model,
                'temperature' => 0.3,
                'max_tokens' => 30,
                'messages' => [['role' => 'user', 'content' => $prompt]],
            ]);

            return trim($r->json('choices.0.message.content') ?? ucfirst($primaryConcern), " \t\n\"'.");
        } catch (\Throwable $e) {
            return ucfirst($primaryConcern);
        }
    }
}
