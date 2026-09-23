<?php

namespace App\Services;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Detalle de UN tema para el panel admin (clic en "Mensajes por tema"):
 * qué pregunta la gente, desde qué zona, con qué tono, tendencia y las
 * conversaciones para leerlas completas.
 *
 * El tema vive en la respuesta del asistente (chat_messages.topic, ver
 * TopicClassifier); la pregunta es el mensaje del ciudadano inmediatamente
 * anterior en la misma sesión.
 */
class TopicInsightsService
{
    /** Tope de respuestas analizadas por consulta: acota memoria en el plan free. */
    private const MAX_ANSWERS = 3000;

    public function build(string $topic, Carbon $start, string $unit): array
    {
        $periodSeconds = now()->diffInSeconds($start, true);
        $prevStart     = $start->copy()->subSeconds((int) $periodSeconds);

        $answers = ChatMessage::query()
            ->where('role', 'assistant')
            ->where('topic', $topic)
            ->where('created_at', '>=', $start)
            ->orderByDesc('id')
            ->limit(self::MAX_ANSWERS)
            ->get(['id', 'session_id', 'created_at']);

        $classifiedTotal = ChatMessage::query()
            ->where('role', 'assistant')
            ->where('created_at', '>=', $start)
            ->whereNotNull('topic')
            ->whereNotIn('topic', ['general', 'otro'])
            ->count();

        $previousTotal = ChatMessage::query()
            ->where('role', 'assistant')
            ->where('topic', $topic)
            ->whereBetween('created_at', [$prevStart, $start])
            ->count();

        $questions = $this->questionsFor($answers);
        $sessions  = $answers->pluck('session_id')->unique()->values();

        return [
            'topic'               => $topic,
            'total_messages'      => $answers->count(),
            'total_conversations' => $sessions->count(),
            'share'               => $classifiedTotal > 0 ? round($answers->count() * 100 / $classifiedTotal, 1) : 0,
            'previous_total'      => $previousTotal,
            'series'              => $this->series($answers, $start, $unit),
            'questions'           => $this->topQuestions($questions),
            'sentiment'           => $this->sentiment($questions),
            'zones'               => $this->zones($sessions, $questions),
            'conversations'       => $this->recentConversations($sessions->take(10), $questions),
        ];
    }

    /**
     * Mensaje del ciudadano que precede a cada respuesta.
     *
     * @return Collection<int, ChatMessage> keyed por id de la respuesta
     */
    private function questionsFor(Collection $answers): Collection
    {
        if ($answers->isEmpty()) {
            return collect();
        }

        $users = ChatMessage::query()
            ->where('role', 'user')
            ->whereIn('session_id', $answers->pluck('session_id')->unique())
            ->where('id', '<', $answers->max('id'))
            ->orderBy('id')
            ->get(['id', 'session_id', 'content', 'sentiment', 'district_mentioned', 'created_at'])
            ->groupBy('session_id');

        $map = collect();
        foreach ($answers as $answer) {
            $previous = ($users[$answer->session_id] ?? collect())->filter(fn ($u) => $u->id < $answer->id)->last();
            if ($previous) {
                $map[$answer->id] = $previous;
            }
        }

        return $map;
    }

    private function topQuestions(Collection $questions): array
    {
        return $questions
            ->groupBy(fn ($q) => TopicClassifier::normalize((string) $q->content))
            ->filter(fn ($group, $key) => $key !== '')
            ->map(fn ($group) => [
                'question' => mb_substr(trim((string) $group->sortByDesc('id')->first()->content), 0, 220),
                'count'    => $group->count(),
            ])
            ->sortByDesc('count')
            ->take(15)
            ->values()
            ->all();
    }

    private function sentiment(Collection $questions): array
    {
        $out = ['positivo' => 0, 'neutral' => 0, 'negativo' => 0, 'sin_analizar' => 0];
        foreach ($questions as $q) {
            $s = $q->sentiment;
            $key = $s === null ? 'sin_analizar' : ($s > 0.15 ? 'positivo' : ($s < -0.15 ? 'negativo' : 'neutral'));
            $out[$key]++;
        }

        return $out;
    }

    /**
     * Zona por conversación: la que declaró el visitante en el chat (ubigeo) →
     * distrito mencionado en sus mensajes → ciudad por IP → "Sin zona".
     */
    private function zones(Collection $sessionIds, Collection $questions): array
    {
        if ($sessionIds->isEmpty()) {
            return [];
        }

        $sessions = ChatSession::whereIn('id', $sessionIds)->get(['id', 'visitor_uuid', 'geo_city']);

        $declared = collect();
        if (Schema::hasTable('visitor_segments') && Schema::hasTable('ubigeo_distritos')) {
            $declared = DB::table('visitor_segments')
                ->join('ubigeo_distritos', 'ubigeo_distritos.id', '=', 'visitor_segments.distrito_id')
                ->whereIn('visitor_segments.visitor_uuid', $sessions->pluck('visitor_uuid')->filter())
                ->pluck('ubigeo_distritos.distrito', 'visitor_segments.visitor_uuid');
        }

        $mentioned = $questions->filter(fn ($q) => $q->district_mentioned)
            ->groupBy('session_id')
            ->map(fn ($g) => $g->last()->district_mentioned);

        return $sessions
            ->map(fn ($s) => $declared[$s->visitor_uuid] ?? $mentioned[$s->id] ?? $s->geo_city ?? 'Sin zona')
            ->countBy(fn ($name) => $name === 'Sin zona' ? $name : mb_convert_case(mb_strtolower((string) $name), MB_CASE_TITLE))
            ->sortDesc()
            ->take(8)
            ->map(fn ($count, $name) => ['name' => $name, 'count' => $count])
            ->values()
            ->all();
    }

    private function recentConversations(Collection $sessionIds, Collection $questions): array
    {
        if ($sessionIds->isEmpty()) {
            return [];
        }

        $firstQuestion = $questions->groupBy('session_id')->map(fn ($g) => $g->sortBy('id')->first());

        return ChatSession::whereIn('id', $sessionIds)
            ->withCount('messages')
            ->get(['id', 'session_id', 'created_at'])
            ->sortByDesc('created_at')
            ->map(fn ($s) => [
                'id'             => $s->id,
                'session_id'     => $s->session_id,
                'created_at'     => $s->created_at?->toIso8601String(),
                'messages_count' => $s->messages_count,
                'question'       => mb_substr((string) ($firstQuestion[$s->id]->content ?? ''), 0, 160),
            ])
            ->values()
            ->all();
    }

    private function series(Collection $answers, Carbon $start, string $unit): array
    {
        [$format, $step, $slots] = match ($unit) {
            'hour'  => ['Y-m-d\TH:00:00', 'addHour', 24],
            'month' => ['Y-m-01', 'addMonth', 12],
            default => ['Y-m-d', 'addDay', (int) $start->copy()->startOfDay()->diffInDays(now()->startOfDay()) + 1],
        };

        $counts = $answers->countBy(fn ($a) => $a->created_at->format($format));

        $out = [];
        $cursor = $start->copy();
        for ($i = 0; $i < $slots; $i++) {
            $key = $cursor->format($format);
            $out[] = ['date' => $key, 'count' => $counts[$key] ?? 0];
            $cursor->{$step}();
        }

        return $out;
    }
}
