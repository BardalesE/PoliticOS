<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IntelAlert;
use App\Models\QuestionCluster;
use App\Services\IntelligenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class IntelligenceController extends Controller
{
    public function __construct(private IntelligenceService $intel) {}

    /** GET /api/admin/intelligence/pulse */
    public function pulse(): JsonResponse
    {
        return response()->json($this->intel->citizenPulse());
    }

    /** GET /api/admin/intelligence/attacks */
    public function attacks(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 30);
        return response()->json($this->intel->attackFeed(min($limit, 100)));
    }

    /** GET /api/admin/intelligence/segments */
    public function segments(): JsonResponse
    {
        return response()->json($this->intel->segmentAnalysis());
    }

    /** GET /api/admin/intelligence/realtime */
    public function realtime(): JsonResponse
    {
        return response()->json($this->intel->realtimeMetrics());
    }

    /** GET /api/admin/intelligence/geo */
    public function geo(Request $request): JsonResponse
    {
        $days = (int) $request->query('days', 7);
        $points = ChatSession::whereNotNull('geo_lat')
            ->where('created_at','>=', now()->subDays($days))
            ->select('geo_region','geo_city','geo_lat','geo_lng',
                     DB::raw('COUNT(*) as count'),
                     DB::raw('AVG(avg_sentiment) as avg_sentiment'),
                     DB::raw('AVG(messages_count) as avg_messages'))
            ->groupBy('geo_region','geo_city','geo_lat','geo_lng')
            ->orderByDesc('count')
            ->limit(500)
            ->get();

        return response()->json(['points' => $points]);
    }

    /** GET /api/admin/intelligence/clusters */
    public function clusters(Request $request): JsonResponse
    {
        $days = (int) $request->query('days', 7);
        $clusters = QuestionCluster::where('analyzed_date','>=', today()->subDays($days))
            ->orderByDesc('message_count')
            ->limit(30)
            ->get();

        return response()->json(['clusters' => $clusters]);
    }

    /** GET /api/admin/intelligence/alerts */
    public function alerts(Request $request): JsonResponse
    {
        $q = IntelAlert::query()->orderByDesc('triggered_at')->limit(50);

        if ($request->boolean('unread', false)) {
            $q->where('acknowledged', false);
        }
        if ($s = $request->query('severity')) {
            $q->where('severity', $s);
        }

        return response()->json(['alerts' => $q->get()]);
    }

    /** POST /api/admin/intelligence/alerts/{id}/ack */
    public function acknowledgeAlert(Request $request, int $id): JsonResponse
    {
        $alert = IntelAlert::findOrFail($id);
        $alert->update([
            'acknowledged'    => true,
            'acknowledged_at' => now(),
            'acknowledged_by' => $request->user()?->id,
        ]);
        return response()->json(['ok' => true]);
    }

    /** GET /api/admin/intelligence/districts */
    public function districts(): JsonResponse
    {
        return response()->json($this->intel->districtAnalysis());
    }

    /** GET /api/admin/intelligence/map */
    public function map(): JsonResponse
    {
        return response()->json($this->intel->mapData());
    }

    /** POST /api/admin/intelligence/regenerate-alerts — útil para testing */
    public function regenerateAlerts(): JsonResponse
    {
        $alerts = $this->intel->generateAlerts();
        return response()->json(['generated' => count($alerts), 'alerts' => $alerts]);
    }
}
