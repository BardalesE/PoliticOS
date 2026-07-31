<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\Faq;
use App\Models\Proposal;
use App\Models\QuestionCluster;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    // GET /api/analytics/summary  (público)
    public function summary(Request $request): JsonResponse
    {
        // ── Periodo (mismo contrato que adminSummary) ────────────
        $period = $request->query('period', 'month');
        if (!in_array($period, ['day', 'week', 'month', 'year'])) {
            $period = 'month';
        }
        [$start, $unit] = $this->resolvePeriod($period);

        // "Activa en el periodo" (creada O con mensajes nuevos), no solo
        // "creada en el periodo" — las sesiones se reutilizan (session_id
        // persistido en el cliente, ver ChatController::resolveSession), así
        // que una visita recurrente no crea sesión nueva pero sí manda
        // mensajes nuevos. Contar solo por creación subcontaba conversaciones
        // reales. Ver informe de QA.
        $totalConversations = $this->activeSessionsQuery($start)->count();
        $totalMessages      = ChatMessage::where('created_at', '>=', $start)->count();

        // Agrupado normalizado en PHP, no GROUP BY sobre el texto crudo —
        // "¿Cuál es tu propuesta de seguridad?" y "cual es tu propuesta de
        // seguridad" antes contaban como preguntas distintas. Ver informe de QA.
        $topQuestions = ChatMessage::where('role', 'user')
            ->where('created_at', '>=', $start)
            ->get(['content'])
            ->countBy(fn ($m) => $this->normalizeQuestionForGrouping($m->content))
            ->sortDesc()
            ->take(10)
            ->map(fn ($count, $question) => ['question' => $question, 'count' => $count])
            ->values();

        $topTopics = ChatMessage::where('role', 'assistant')
            ->where('created_at', '>=', $start)
            ->select(
                DB::raw("COALESCE(topic, 'general') as topic"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("COALESCE(topic, 'general')"))
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        $perDay = $this->buildSeries($start, $unit);

        return response()->json([
            'total_conversations'   => $totalConversations,
            'total_messages'        => $totalMessages,
            'top_questions'         => $topQuestions,
            'top_topics'            => $topTopics,
            'conversations_per_day' => $perDay,
            'period'                => $period,
            'granularity'           => $unit,
        ]);
    }

    // GET /api/admin/analytics  (protegido — solo admin)
    public function adminSummary(Request $request): JsonResponse
    {
        // ── Periodo ──────────────────────────────────────────────
        $period = $request->query('period', 'month');
        if (!in_array($period, ['day', 'week', 'month', 'year'])) {
            $period = 'month';
        }
        [$start, $unit] = $this->resolvePeriod($period);

        // ── Conteos de contenido (siempre totales) ───────────────
        $proposalsByStatus = Proposal::select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $contentCounts = [
            'proposals' => Proposal::count(),
            'videos'    => Video::count(),
            'faqs'      => Faq::count(),
        ];

        // ── Conversaciones (scopeadas al periodo) ────────────────
        // "Activa" (creada O con mensajes nuevos) — no solo "creada" — para
        // que total/today/this_week midan lo mismo entre sí y con
        // avg_messages. Antes "today" ya usaba este criterio pero "total" y
        // "this_week" no, así que "hoy" podía salir MAYOR que "esta semana"
        // con sesiones reutilizadas. Ver informe de QA.
        $totalSessions = $this->activeSessionsQuery($start)->count();
        $todaySessions = $this->activeSessionsQuery(today())->count();
        $weekSessions  = $this->activeSessionsQuery(now()->subDays(7))->count();
        $totalMessages = ChatMessage::where('created_at', '>=', $start)->count();

        $avgMessages = $totalSessions > 0
            ? round($totalMessages / $totalSessions, 1)
            : 0;

        $messagesByRole = ChatMessage::select('role', DB::raw('COUNT(*) as count'))
            ->groupBy('role')
            ->pluck('count', 'role');

        // ── Serie temporal scopeada al periodo ───────────────────
        $days = $this->buildSeries($start, $unit);

        // ── Top topics (incluye mensajes sin topic como "general") ──
        // Antes esta consulta ignoraba $start: cambiar el selector de
        // periodo en el dashboard no movía este bloque, lo que se lee como
        // "los números no cuadran". Ver informe de QA.
        $topTopics = ChatMessage::where('role', 'assistant')
            ->where('created_at', '>=', $start)
            ->select(
                DB::raw("COALESCE(topic, 'general') as topic"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("COALESCE(topic, 'general')"))
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        // ── Top preguntas (usa clusters si existen, sino concerns) ──
        // ClusterTopQuestionsJob genera un snapshot POR DÍA (analyzed_date).
        // Se filtra al periodo pedido y se agrega con SUM/GROUP BY — sin esto,
        // un ORDER BY message_count sin fecha podía devolver el mismo tema
        // repetido varias veces (una fila por día) con conteos que no sumaban
        // la actividad real del periodo. Ver informe de QA.
        $clusters = QuestionCluster::where('analyzed_date', '>=', $start->toDateString())
            ->select(
                'cluster_label',
                DB::raw('MAX(representative_question) as representative_question'),
                DB::raw('SUM(message_count) as message_count')
            )
            ->groupBy('cluster_label')
            ->orderByDesc('message_count')
            ->limit(8)
            ->get();

        if ($clusters->isNotEmpty()) {
            $topQuestions = $clusters->map(fn($c) => [
                'question' => $c->representative_question ?: $c->cluster_label,
                'count'    => (int) $c->message_count,
            ]);
        } else {
            // Fallback: agrupar por concern principal extraído por AnalyzeMessageJob
            $allConcerns = ChatMessage::where('role','user')
                ->where('created_at', '>=', $start)
                ->whereNotNull('concerns')
                ->where('concerns','!=','[]')
                ->pluck('concerns');

            if ($allConcerns->isNotEmpty()) {
                $topQuestions = $allConcerns
                    ->flatMap(fn($c) => is_array($c) ? $c : (json_decode($c, true) ?? []))
                    ->countBy()
                    ->sortDesc()
                    ->take(8)
                    ->map(fn($count, $concern) => ['question' => ucfirst($concern), 'count' => $count])
                    ->values();
            } else {
                // Último recurso: substring normalizado de 60 chars (ver
                // normalizeQuestionForGrouping — antes agrupaba por el texto
                // crudo, así que mayúsculas/tildes/puntuación distintas de la
                // MISMA pregunta contaban como preguntas separadas).
                $topQuestions = ChatMessage::where('role', 'user')
                    ->where('created_at', '>=', $start)
                    ->get(['content'])
                    ->countBy(fn ($m) => $this->normalizeQuestionForGrouping($m->content))
                    ->sortDesc()
                    ->take(8)
                    ->map(fn($count, $question) => ['question' => $question, 'count' => $count])
                    ->values();
            }
        }

        // ── Propuestas por tema ──────────────────────────────────
        $proposalsByTopic = Proposal::select('topic', DB::raw('COUNT(*) as count'))
            ->groupBy('topic')
            ->orderByDesc('count')
            ->get();

        // ── Sesiones recientes ───────────────────────────────────
        $recentSessions = ChatSession::withCount('messages')
            ->orderByDesc('created_at')
            ->limit(5)
            ->get(['id', 'session_id', 'ip', 'created_at']);

        return response()->json([
            'content_counts'      => $contentCounts,
            'proposals_by_status' => $proposalsByStatus,
            'proposals_by_topic'  => $proposalsByTopic,
            'sessions' => [
                'total'        => $totalSessions,
                'today'        => $todaySessions,
                'this_week'    => $weekSessions,
                'avg_messages' => $avgMessages,
            ],
            'messages' => [
                'total'   => $totalMessages,
                'by_role' => $messagesByRole,
            ],
            'conversations_per_day' => $days,
            'top_topics'            => $topTopics,
            'top_questions'         => $topQuestions,
            'recent_sessions'       => $recentSessions,
            'period'                => $period,
            'granularity'           => $unit,
            'range'                 => [
                'start' => $start->toIso8601String(),
                'end'   => now()->toIso8601String(),
            ],
        ]);
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Sesiones "activas" desde $since: creadas O con mensajes nuevos. Las
     * sesiones se reutilizan (session_id persistido en el cliente), así que
     * contar solo por fecha de creación subcuenta conversaciones reales de
     * visitantes recurrentes. Ver informe de QA.
     */
    private function activeSessionsQuery(\DateTimeInterface $since)
    {
        return ChatSession::where(function ($q) use ($since) {
            $q->where('created_at', '>=', $since)
              ->orWhereHas('messages', fn ($q2) => $q2->where('created_at', '>=', $since));
        });
    }

    /**
     * Normaliza una pregunta para agruparla con sus variantes: minúsculas,
     * sin tildes/puntuación, espacios colapsados. "¿Cuál es tu propuesta de
     * seguridad?" y "cual es tu propuesta de seguridad" antes contaban como
     * preguntas distintas (GROUP BY sobre el texto crudo). Ver informe de QA.
     */
    private function normalizeQuestionForGrouping(string $content): string
    {
        $normalized = mb_strtolower(trim($content));
        $normalized = strtr($normalized, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        ]);
        $normalized = preg_replace('/[^\p{L}\p{N}\s]/u', '', $normalized);
        $normalized = preg_replace('/\s+/', ' ', trim($normalized));

        return mb_substr($normalized, 0, 60);
    }

    // ─── Helpers de periodo ───────────────────────────────────────────

    private function resolvePeriod(string $period): array
    {
        return match ($period) {
            'day'   => [now()->subHours(23)->startOfHour(), 'hour'],
            'week'  => [now()->subDays(6)->startOfDay(),    'day'],
            'year'  => [now()->subMonths(11)->startOfMonth(), 'month'],
            default => [now()->subDays(29)->startOfDay(),   'day'],  // month
        };
    }

    private function buildSeries(Carbon $start, string $unit): \Illuminate\Support\Collection
    {
        if ($unit === 'hour') {
            $raw = ChatSession::select(
                    DB::raw("DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00') as date"),
                    DB::raw('COUNT(*) as count')
                )
                ->where('created_at', '>=', $start)
                ->groupBy('date')
                ->orderBy('date')
                ->get()
                ->keyBy('date');

            $result = collect();
            for ($i = 0; $i <= 23; $i++) {
                $slot = $start->copy()->addHours($i);
                $key  = $slot->format('Y-m-d\TH:00:00');
                $result->push(['date' => $key, 'count' => $raw->get($key)?->count ?? 0]);
            }
            return $result;
        }

        if ($unit === 'month') {
            $raw = ChatSession::select(
                    DB::raw("DATE_FORMAT(created_at, '%Y-%m-01') as date"),
                    DB::raw('COUNT(*) as count')
                )
                ->where('created_at', '>=', $start)
                ->groupBy('date')
                ->orderBy('date')
                ->get()
                ->keyBy('date');

            $result = collect();
            for ($i = 0; $i <= 11; $i++) {
                $slot = $start->copy()->addMonths($i)->startOfMonth();
                $key  = $slot->format('Y-m-01');
                $result->push(['date' => $key, 'count' => $raw->get($key)?->count ?? 0]);
            }
            return $result;
        }

        // day — usado para week (7 puntos) y month (30 puntos)
        $totalDays = (int) $start->diffInDays(now());
        $raw = ChatSession::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as count')
            )
            ->where('created_at', '>=', $start)
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $result = collect();
        for ($i = 0; $i <= $totalDays; $i++) {
            $date = $start->copy()->addDays($i)->toDateString();
            $result->push(['date' => $date, 'count' => $raw->get($date)?->count ?? 0]);
        }
        return $result;
    }
}
