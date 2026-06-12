<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\Faq;
use App\Models\Proposal;
use App\Models\QuestionCluster;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    // GET /api/analytics/summary  (público)
    public function summary(): JsonResponse
    {
        $totalConversations = ChatSession::count();
        $totalMessages      = ChatMessage::count();

        $topQuestions = ChatMessage::where('role', 'user')
            ->select(
                DB::raw('LOWER(SUBSTRING(content, 1, 80)) as question'),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy('question')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        $topTopics = ChatMessage::where('role', 'assistant')
            ->select(
                DB::raw("COALESCE(topic, 'general') as topic"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("COALESCE(topic, 'general')"))
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        $perDay = ChatSession::select(
                DB::raw('DATE(started_at) as date'),
                DB::raw('COUNT(*) as count')
            )
            ->where('started_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json([
            'total_conversations'   => $totalConversations,
            'total_messages'        => $totalMessages,
            'top_questions'         => $topQuestions,
            'top_topics'            => $topTopics,
            'conversations_per_day' => $perDay,
        ]);
    }

    // GET /api/admin/analytics  (protegido — solo admin)
    public function adminSummary(): JsonResponse
    {
        // ── Conteos de contenido ─────────────────────────────────
        $proposalsByStatus = Proposal::select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $contentCounts = [
            'proposals' => Proposal::count(),
            'videos'    => Video::count(),
            'faqs'      => Faq::count(),
        ];

        // ── Conversaciones ───────────────────────────────────────
        $totalSessions  = ChatSession::count();
        // Sesiones con actividad hoy (nuevas O con mensajes hoy)
        $todaySessions  = ChatSession::where(function ($q) {
            $q->whereDate('created_at', today())
              ->orWhereHas('messages', fn($q2) => $q2->whereDate('created_at', today()));
        })->count();
        $weekSessions   = ChatSession::where('created_at', '>=', now()->subDays(7))->count();
        $totalMessages  = ChatMessage::count();

        $avgMessages = $totalSessions > 0
            ? round($totalMessages / $totalSessions, 1)
            : 0;

        $messagesByRole = ChatMessage::select('role', DB::raw('COUNT(*) as count'))
            ->groupBy('role')
            ->pluck('count', 'role');

        // ── Conversaciones por día (30 días) ─────────────────────
        $perDay = ChatSession::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as count')
            )
            ->where('created_at', '>=', now()->subDays(29))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        // Rellenar días sin datos con 0
        $days = collect();
        for ($i = 29; $i >= 0; $i--) {
            $date = now()->subDays($i)->toDateString();
            $days->push(['date' => $date, 'count' => $perDay->get($date)?->count ?? 0]);
        }

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
                'total'       => $totalSessions,
                'today'       => $todaySessions,
                'this_week'   => $weekSessions,
                'avg_messages'=> $avgMessages,
            ],
            'messages' => [
                'total' => $totalMessages,
                'by_role' => $messagesByRole,
            ],
            'conversations_per_day' => $days,
            'top_topics'            => $topTopics,
            'top_questions'         => $topQuestions,
            'recent_sessions'       => $recentSessions,
        ]);
    }
}
