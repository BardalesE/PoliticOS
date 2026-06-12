<?php

namespace App\Services;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\ExternalSignal;
use App\Models\IntelAlert;
use App\Models\QuestionCluster;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

/**
 * Servicio de Inteligencia Electoral.
 *
 * Provee:
 *   - Pulso ciudadano (sentiment, intent, segmentos, geografía)
 *   - Detección de ataques (interno + externo)
 *   - Recomendaciones estratégicas
 *   - Trigger de alertas automáticas
 *
 * Cache 60s para reducir carga.
 */
class IntelligenceService
{
    public function citizenPulse(): array
    {
        return Cache::remember(TenantContext::cacheKey('intel.pulse'), 60, function () {
            $today    = today();
            $weekAgo  = now()->subDays(7);

            // Sentimiento promedio últimas 24h vs semana
            $sentimentToday = ChatMessage::where('role','user')
                ->whereDate('created_at', $today)
                ->whereNotNull('sentiment')
                ->avg('sentiment');

            $sentimentWeek = ChatMessage::where('role','user')
                ->where('created_at','>=',$weekAgo)
                ->whereNotNull('sentiment')
                ->avg('sentiment');

            // Top emociones del día
            $emotions = ChatMessage::where('role','user')
                ->whereDate('created_at', $today)
                ->whereNotNull('emotion')
                ->select('emotion', DB::raw('COUNT(*) as count'))
                ->groupBy('emotion')->orderByDesc('count')->get();

            // Distribución de intención
            $intents = ChatMessage::where('role','user')
                ->where('created_at','>=',$weekAgo)
                ->whereNotNull('intent')
                ->select('intent', DB::raw('COUNT(*) as count'))
                ->groupBy('intent')->orderByDesc('count')->get();

            // Conversaciones por región (mapa de calor)
            $byRegion = ChatSession::whereNotNull('geo_region')
                ->where('created_at','>=',$weekAgo)
                ->select('geo_region', DB::raw('COUNT(*) as sessions'),
                         DB::raw('AVG(avg_sentiment) as avg_sentiment'))
                ->groupBy('geo_region')->orderByDesc('sessions')->limit(30)->get();

            // Segmentos detectados
            $segments = ChatSession::whereNotNull('inferred_segment')
                ->where('created_at','>=',$weekAgo)
                ->select('inferred_segment', DB::raw('COUNT(*) as count'))
                ->groupBy('inferred_segment')->orderByDesc('count')->get();

            // Intención de voto declarada (de citizen_data)
            $intentions = DB::table('citizen_data')
                ->where('field_name','intencion_voto')
                ->where('created_at','>=',$weekAgo)
                ->select('field_value', DB::raw('COUNT(*) as count'))
                ->groupBy('field_value')->orderByDesc('count')->get();

            return [
                'sentiment' => [
                    'today' => round((float)($sentimentToday ?? 0), 2),
                    'week'  => round((float)($sentimentWeek ?? 0), 2),
                    'delta' => round((float)(($sentimentToday ?? 0) - ($sentimentWeek ?? 0)), 2),
                ],
                'emotions'        => $emotions,
                'intents'         => $intents,
                'by_region'       => $byRegion,
                'segments'        => $segments,
                'voter_intentions' => $intentions,
            ];
        });
    }

    public function attackFeed(int $limit = 30): array
    {
        return Cache::remember(TenantContext::cacheKey("intel.attacks.{$limit}"), 120, function () use ($limit) {
            $weekAgo = now()->subDays(7);

            // Ataques internos (en el chat)
            $internalAttacks = ChatMessage::where('attack_detected', true)
                ->where('created_at','>=',$weekAgo)
                ->select('id','content','attack_category','sentiment','created_at')
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get()
                ->map(fn($m) => [
                    'source'    => 'chat',
                    'content'   => mb_substr($m->content, 0, 240),
                    'category'  => $m->attack_category,
                    'sentiment' => $m->sentiment,
                    'date'      => $m->created_at,
                ]);

            // Ataques externos (redes/noticias)
            $externalAttacks = ExternalSignal::where('is_attack', true)
                ->where('captured_at','>=',$weekAgo)
                ->select('source','source_name','content','target_candidate','sentiment','captured_at','source_url','engagement')
                ->orderByDesc('captured_at')
                ->limit($limit)
                ->get()
                ->map(fn($s) => [
                    'source'     => $s->source,
                    'source_name'=> $s->source_name,
                    'content'    => mb_substr($s->content, 0, 240),
                    'target'     => $s->target_candidate,
                    'sentiment'  => $s->sentiment,
                    'url'        => $s->source_url,
                    'engagement' => $s->engagement,
                    'date'       => $s->captured_at,
                ]);

            $combined = $internalAttacks->concat($externalAttacks)
                ->sortByDesc('date')
                ->values()
                ->take($limit);

            // Categorías más atacadas
            $topCategories = ChatMessage::where('attack_detected', true)
                ->where('created_at','>=',$weekAgo)
                ->whereNotNull('attack_category')
                ->select('attack_category', DB::raw('COUNT(*) as count'))
                ->groupBy('attack_category')->orderByDesc('count')->get();

            // Velocidad de propagación (ataques/hora últimas 24h)
            $velocity = ExternalSignal::where('is_attack', true)
                ->where('captured_at','>=', now()->subDay())
                ->select(DB::raw("DATE_FORMAT(captured_at, '%Y-%m-%d %H:00') as hour"),
                         DB::raw('COUNT(*) as count'))
                ->groupBy('hour')->orderBy('hour')->get();

            return [
                'feed'           => $combined->all(),
                'top_categories' => $topCategories,
                'velocity_24h'   => $velocity,
                'total_week'     => $internalAttacks->count() + $externalAttacks->count(),
            ];
        });
    }

    public function segmentAnalysis(): array
    {
        return Cache::remember(TenantContext::cacheKey('intel.segments'), 300, function () {
            $weekAgo = now()->subDays(7);

            // Concerns por segmento
            $concernsBySegment = ChatMessage::where('chat_messages.role','user')
                ->where('chat_messages.created_at','>=',$weekAgo)
                ->join('chat_sessions','chat_messages.session_id','=','chat_sessions.id')
                ->whereNotNull('chat_sessions.inferred_segment')
                ->whereNotNull('chat_messages.concerns')
                ->get(['chat_sessions.inferred_segment','chat_messages.concerns'])
                ->groupBy('inferred_segment')
                ->map(function($group) {
                    $allConcerns = [];
                    foreach ($group as $m) {
                        $concerns = is_array($m->concerns) ? $m->concerns : json_decode($m->concerns, true);
                        if (is_array($concerns)) {
                            foreach ($concerns as $c) $allConcerns[] = $c;
                        }
                    }
                    $counts = array_count_values($allConcerns);
                    arsort($counts);
                    return array_slice($counts, 0, 8);
                });

            // Funnel: visitas → chats → datos → intención
            $funnel = [
                'visitors'         => ChatSession::where('created_at','>=',$weekAgo)->count(),
                'engaged'          => ChatSession::where('created_at','>=',$weekAgo)->where('messages_count','>=',2)->count(),
                'consented'        => ChatSession::where('created_at','>=',$weekAgo)->where('consent_data_capture',true)->count(),
                'declared_intent'  => DB::table('citizen_data')->where('field_name','intencion_voto')
                                          ->where('created_at','>=',$weekAgo)->distinct('session_id')->count('session_id'),
            ];

            // Top temas por segmento
            $topicsBySegment = ChatMessage::where('chat_messages.role','assistant')
                ->where('chat_messages.created_at','>=',$weekAgo)
                ->whereNotNull('chat_messages.topic')
                ->join('chat_sessions','chat_messages.session_id','=','chat_sessions.id')
                ->whereNotNull('chat_sessions.inferred_segment')
                ->select('chat_sessions.inferred_segment','chat_messages.topic',
                         DB::raw('COUNT(*) as count'))
                ->groupBy('chat_sessions.inferred_segment','chat_messages.topic')
                ->orderByDesc('count')->get()
                ->groupBy('inferred_segment');

            return [
                'concerns_by_segment' => $concernsBySegment,
                'funnel'              => $funnel,
                'topics_by_segment'   => $topicsBySegment,
            ];
        });
    }

    public function realtimeMetrics(): array
    {
        return Cache::remember(TenantContext::cacheKey('intel.realtime'), 10, function () {
            $last10min = now()->subMinutes(10);

            return [
                'active_sessions'       => ChatSession::where('updated_at', '>=', $last10min)->count(),
                'messages_per_min'      => round(ChatMessage::where('created_at', '>=', now()->subMinute())->count(), 0),
                'unacknowledged_alerts' => IntelAlert::unread()->count(),
                'critical_alerts'       => IntelAlert::unread()->bySeverity('critical')->count(),
            ];
        });
    }

    public function mapData(): array
    {
        // Ciudadanos registrados con GPS del navegador
        $citizens = \App\Models\CitizenProfile::whereNotNull('browser_lat')
            ->whereNotNull('browser_lng')
            ->select([
                'id', 'name', 'district', 'voting_intention', 'points_balance',
                'browser_lat', 'browser_lng',
                'location_district', 'location_province', 'location_department',
                'created_at',
            ])
            ->orderByDesc('created_at')
            ->limit(2000)
            ->get()
            ->map(fn($c) => [
                'id'                  => $c->id,
                'name'                => $c->name,
                'district'            => $c->district ?? $c->location_district,
                'voting_intention'    => $c->voting_intention,
                'points'              => $c->points_balance,
                'lat'                 => (float) $c->browser_lat,
                'lng'                 => (float) $c->browser_lng,
                'location_department' => $c->location_department,
                'created_at'          => $c->created_at,
            ]);

        // Chat sessions anónimas con GPS (usuarios que no se registraron)
        $sessions = \App\Models\ChatSession::whereNotNull('browser_lat')
            ->whereNotNull('browser_lng')
            ->select(['id', 'geo_city', 'geo_region', 'browser_lat', 'browser_lng',
                      'inferred_segment', 'avg_sentiment', 'created_at'])
            ->orderByDesc('created_at')
            ->limit(500)
            ->get()
            ->map(fn($s) => [
                'id'               => 'session_' . $s->id,
                'name'             => null,
                'district'         => $s->geo_city,
                'voting_intention' => null,
                'points'           => 0,
                'lat'              => (float) $s->browser_lat,
                'lng'              => (float) $s->browser_lng,
                'segment'          => $s->inferred_segment,
                'created_at'       => $s->created_at,
            ]);

        return [
            'citizens' => $citizens,
            'sessions' => $sessions,
            'total'    => $citizens->count() + $sessions->count(),
        ];
    }

    public function districtAnalysis(): array
    {
        return Cache::remember(TenantContext::cacheKey('intel.districts'), 120, function () {
            $weekAgo = now()->subDays(7);

            // Menciones y sentimiento promedio por distrito
            $byDistrict = ChatMessage::where('role', 'user')
                ->where('created_at', '>=', $weekAgo)
                ->whereNotNull('district_mentioned')
                ->select(
                    'district_mentioned',
                    DB::raw('COUNT(*) as mentions'),
                    DB::raw('AVG(sentiment) as avg_sentiment')
                )
                ->groupBy('district_mentioned')
                ->orderByDesc('mentions')
                ->limit(20)
                ->get()
                ->map(fn($r) => [
                    'district'     => $r->district_mentioned,
                    'mentions'     => $r->mentions,
                    'avg_sentiment'=> round((float)($r->avg_sentiment ?? 0), 2),
                ]);

            // Problemas mencionados por distrito (últimos 500 mensajes con problemas)
            $rows = ChatMessage::where('role', 'user')
                ->where('created_at', '>=', $weekAgo)
                ->whereNotNull('district_mentioned')
                ->whereNotNull('problems_mentioned')
                ->where('problems_mentioned', '!=', '[]')
                ->select('district_mentioned', 'problems_mentioned')
                ->limit(500)
                ->get();

            $problemsByDistrict = $rows->groupBy('district_mentioned')
                ->map(function ($group) {
                    $all = [];
                    foreach ($group as $m) {
                        $probs = is_array($m->problems_mentioned)
                            ? $m->problems_mentioned
                            : json_decode($m->problems_mentioned ?? '[]', true);
                        if (is_array($probs)) {
                            foreach ($probs as $p) $all[] = $p;
                        }
                    }
                    return array_values(array_slice(array_unique($all), 0, 10));
                });

            // Propuestas ciudadanas (top 50 más recientes con distrito)
            $citizenProposals = ChatMessage::where('role', 'user')
                ->where('created_at', '>=', $weekAgo)
                ->whereNotNull('proposals_detected')
                ->where('proposals_detected', '!=', '[]')
                ->select('district_mentioned', 'proposals_detected', 'created_at')
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
                ->flatMap(function ($m) {
                    $props = is_array($m->proposals_detected)
                        ? $m->proposals_detected
                        : json_decode($m->proposals_detected ?? '[]', true);
                    return collect($props)->map(fn($p) => [
                        'district' => $m->district_mentioned ?? 'Sin distrito',
                        'text'     => $p,
                        'date'     => $m->created_at,
                    ]);
                })
                ->values()
                ->take(50);

            return [
                'by_district'          => $byDistrict,
                'problems_by_district' => $problemsByDistrict,
                'citizen_proposals'    => $citizenProposals,
            ];
        });
    }

    /**
     * Genera alertas automáticas. Llamado por scheduler cada 5 min.
     */
    public function generateAlerts(): array
    {
        $alerts = [];

        // 1. Spike de ataques: ¿más de 10 ataques en última hora vs promedio horario?
        $lastHour = ChatMessage::where('attack_detected', true)
            ->where('created_at','>=', now()->subHour())->count();

        $avgHour = ChatMessage::where('attack_detected', true)
            ->where('created_at','>=', now()->subDays(7))
            ->count() / 168;

        if ($lastHour > max(10, $avgHour * 3)) {
            $alerts[] = IntelAlert::create([
                'severity'    => 'high',
                'type'        => 'attack_spike',
                'title'       => "Spike de ataques detectado: {$lastHour} en la última hora",
                'description' => "El promedio histórico es ".round($avgHour, 1)." ataques/hora. Estás recibiendo 3x más de lo normal.",
                'payload'     => ['count' => $lastHour, 'avg' => $avgHour],
                'triggered_at'=> now(),
            ]);
        }

        // 2. Drop de sentimiento: ¿avg de hoy es <-0.3 y bajó vs ayer?
        $todaySent = (float) ChatMessage::where('role','user')
            ->whereDate('created_at', today())
            ->whereNotNull('sentiment')->avg('sentiment');

        $yesterdaySent = (float) ChatMessage::where('role','user')
            ->whereDate('created_at', today()->subDay())
            ->whereNotNull('sentiment')->avg('sentiment');

        if ($todaySent < -0.3 && ($todaySent - $yesterdaySent) < -0.2) {
            $alerts[] = IntelAlert::create([
                'severity'    => 'high',
                'type'        => 'sentiment_drop',
                'title'       => 'Sentimiento ciudadano cayó significativamente',
                'description' => "Hoy: ".round($todaySent, 2).". Ayer: ".round($yesterdaySent, 2).". Caída de ".round($yesterdaySent - $todaySent, 2)." puntos.",
                'payload'     => ['today' => $todaySent, 'yesterday' => $yesterdaySent],
                'triggered_at'=> now(),
            ]);
        }

        // 3. Tema viral nuevo: ¿algún topic con >50 menciones en 24h y >5x promedio?
        $hotTopics = ChatMessage::where('created_at','>=', now()->subDay())
            ->whereNotNull('topic')
            ->select('topic', DB::raw('COUNT(*) as count'))
            ->groupBy('topic')->having('count','>',50)->get();

        foreach ($hotTopics as $hot) {
            $weeklyAvg = ChatMessage::where('topic', $hot->topic)
                ->where('created_at','>=', now()->subDays(7))
                ->count() / 7;

            if ($hot->count > $weeklyAvg * 5) {
                $alerts[] = IntelAlert::firstOrCreate(
                    [
                        'type' => 'viral_topic',
                        'source_table' => 'topics',
                        'source_id' => null,
                        'acknowledged' => false,
                        'payload->topic' => $hot->topic,
                    ],
                    [
                        'severity'    => 'medium',
                        'title'       => "Tema viral: '{$hot->topic}' explotó hoy",
                        'description' => "Pasó de ".round($weeklyAvg, 0)." menciones/día a {$hot->count} hoy.",
                        'payload'     => ['topic' => $hot->topic, 'count' => $hot->count, 'avg' => $weeklyAvg],
                        'triggered_at'=> now(),
                    ]
                );
            }
        }

        return $alerts;
    }
}
