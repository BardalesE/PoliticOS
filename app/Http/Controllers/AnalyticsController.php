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

        $totalConversations = ChatSession::where('created_at', '>=', $start)->count();
        $totalMessages      = ChatMessage::where('created_at', '>=', $start)->count();

        $topQuestions = ChatMessage::where('role', 'user')
            ->where('created_at', '>=', $start)
            ->select(
                DB::raw('LOWER(SUBSTRING(content, 1, 80)) as question'),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy('question')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

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
        $totalSessions = ChatSession::where('created_at', '>=', $start)->count();
        // Ventanas fijas: hoy y esta semana no cambian con el filtro
        $todaySessions = ChatSession::where(function ($q) {
            $q->whereDate('created_at', today())
              ->orWhereHas('messages', fn($q2) => $q2->whereDate('created_at', today()));
        })->count();
        $weekSessions  = ChatSession::where('created_at', '>=', now()->subDays(7))->count();
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
        $topTopics = ChatMessage::where('role', 'assistant')
            ->select(
                DB::raw("COALESCE(topic, 'general') as topic"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("COALESCE(topic, 'general')"))
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        // ── Top preguntas (usa clusters si existen, sino concerns) ──
        $clusters = QuestionCluster::orderByDesc('message_count')->limit(8)->get();

        if ($clusters->isNotEmpty()) {
            $topQuestions = $clusters->map(fn($c) => [
                'question' => $c->representative_question ?: $c->cluster_label,
                'count'    => $c->message_count,
            ]);
        } else {
            // Fallback: agrupar por concern principal extraído por AnalyzeMessageJob
            $allConcerns = ChatMessage::where('role','user')
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
                // Último recurso: substring de 60 chars
                $topQuestions = ChatMessage::where('role', 'user')
                    ->select(
                        DB::raw('LOWER(SUBSTRING(content, 1, 60)) as question'),
                        DB::raw('COUNT(*) as count')
                    )
                    ->groupBy('question')
                    ->orderByDesc('count')
                    ->limit(8)
                    ->get();
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
