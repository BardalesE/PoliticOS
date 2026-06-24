<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\ProposalController;
use App\Http\Controllers\VideoController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\GalleryController;
use App\Http\Controllers\CampaignVideoController;
use App\Http\Controllers\HeroSettingController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\TeamMemberController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\KnowledgeDocumentController;
use App\Http\Controllers\CandidateProfileController;
use App\Http\Controllers\AiSettingController;
use App\Http\Controllers\DistrictController;
use App\Http\Controllers\TopicController;
use App\Http\Controllers\SuggestedQuestionController;
use App\Http\Controllers\CitizenController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\SuperAdminController;
use App\Http\Controllers\IntelligenceController;
use App\Http\Controllers\AttackResponseController;
use App\Http\Controllers\ExternalSignalController;
use App\Http\Controllers\IngestEntityController;
use App\Http\Controllers\LiveStreamController;
use App\Http\Controllers\OnboardingController;

/*
|--------------------------------------------------------------------------
| API Routes — PoliticOS v2
|--------------------------------------------------------------------------
*/

Route::group([], function () { // ResolveTenant is in the global 'api' group (bootstrap/app.php)

    // ─── Auth ─────────────────────────────────────────────────────────
    Route::prefix('auth')->group(function () {
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
        });
    });

    // ─── Chat público (rate-limited + captura de contexto) ────────────
    Route::prefix('chat')->middleware([
        'throttle:30,1',
        \App\Http\Middleware\CaptureRequestContext::class,
    ])->group(function () {
        Route::post('/',             [ChatController::class, 'send']);
        Route::post('/stream',       [ChatController::class, 'stream']);
        Route::get('/session/{id}',  [ChatController::class, 'session']);
        Route::post('/consent',      [ChatController::class, 'consent']);
    });

    // ─── Registro ciudadano (público) ────────────────────────────────
    Route::post('/citizen/register',        [CitizenController::class, 'register'])->middleware('throttle:5,1');
    Route::get ('/citizen/profile/{uuid}',  [CitizenController::class, 'showByUuid']);
    Route::get ('/citizen/referral/{code}', [CitizenController::class, 'referralInfo']);

    // ─── Perfil del candidato (público) ──────────────────────────────
    Route::get('/candidate', [CandidateProfileController::class, 'show']);

    // ─── Propuestas (público) ─────────────────────────────────────────
    Route::get('/proposals',      [ProposalController::class, 'index']);
    Route::get('/proposals/{id}', [ProposalController::class, 'show']);

    // ─── Videos URL (público) ────────────────────────────────────────
    Route::get('/videos', [VideoController::class, 'index']);

    // ─── Analytics (público — métricas resumen) ──────────────────────
    Route::get('/analytics/summary', [AnalyticsController::class, 'summary'])->middleware('throttle:20,1');

    // ─── Live Streams (público) ───────────────────────────────────────
    Route::get ('/livestreams',              [LiveStreamController::class, 'index']);
    Route::get ('/livestreams/{key}',        [LiveStreamController::class, 'show']);
    Route::get ('/livestreams/{key}/info',        [LiveStreamController::class, 'info']);
    Route::get ('/livestreams/{key}/chunk/{seq}',  [LiveStreamController::class, 'serveChunk']);
    Route::get ('/livestreams/{key}/recording',    [LiveStreamController::class, 'recording']);
    Route::post('/livestreams/{key}/ping',        [LiveStreamController::class, 'ping'])->middleware('throttle:60,1');
    Route::get ('/livestreams/{key}/comments',    [LiveStreamController::class, 'getComments']);
    Route::post('/livestreams/{key}/comments',    [LiveStreamController::class, 'postComment'])->middleware('throttle:15,1');

    // ─── Galería (público) ───────────────────────────────────────────
    Route::get('/gallery',            [GalleryController::class, 'index']);
    Route::get('/gallery/categories', [GalleryController::class, 'categories']);

    // ─── Videos de campaña (público) ─────────────────────────────────
    Route::get('/campaign-videos', [CampaignVideoController::class, 'index']);

    // ─── Hero settings (público) ─────────────────────────────────────
    Route::get('/hero-settings', [HeroSettingController::class, 'show']);

    // ─── Eventos (público) ───────────────────────────────────────────
    Route::get('/events',          [EventController::class, 'index']);
    Route::get('/events/featured', [EventController::class, 'featured']);

    // ─── Equipo (público) ────────────────────────────────────────────
    Route::get('/team-members', [TeamMemberController::class, 'index']);

    // ─── Configuración home (público) ────────────────────────────────
    Route::get('/home-settings', [SettingController::class, 'publicIndex']);

    // ─── Ingest service (Python) ─────────────────────────────────────
    // Key dedicada en vez de auth:sanctum: los tokens Sanctum viven en la BD
    // de cada tenant, así que un solo token no puede postear a varios tenants.
    // Mismo path /admin/... para conservar el gate de plan (CheckPlanFeature
    // matchea por path) y la URL que ya usa el servicio Python.
    Route::post('/admin/external-signals/ingest', [ExternalSignalController::class, 'ingest'])
        ->middleware(['ingest_key', 'plan_feature', 'throttle:60,1']);

    // Diccionario de entidades JNE (global, no depende del tenant). El servicio
    // Python lo pullea vía beat (diaria + boot) y lo cachea en su Redis. Sin
    // plan_feature: es data de referencia, no una feature del tenant.
    Route::get('/ingest/entities', [IngestEntityController::class, 'index'])
        ->middleware(['ingest_key', 'throttle:30,1']);

    // ─── Admin (sanctum + rol admin + plan check) ────────────────────
    Route::middleware(['auth:sanctum', 'admin', 'plan_feature'])->prefix('admin')->group(function () {

        // Analytics
        Route::get('/analytics', [AnalyticsController::class, 'adminSummary']);

        // ━━━ INTELIGENCIA ELECTORAL (NUEVO en v2) ━━━━━━━━━━━━━━━━━━━━
        Route::prefix('intelligence')->group(function () {
            Route::get('/pulse',          [IntelligenceController::class, 'pulse']);
            Route::get('/attacks',        [IntelligenceController::class, 'attacks']);
            Route::get('/segments',       [IntelligenceController::class, 'segments']);
            Route::get('/realtime',       [IntelligenceController::class, 'realtime']);
            Route::get('/geo',            [IntelligenceController::class, 'geo']);
            Route::get('/clusters',       [IntelligenceController::class, 'clusters']);
            Route::get('/alerts',         [IntelligenceController::class, 'alerts']);
            Route::post('/alerts/{id}/ack', [IntelligenceController::class, 'acknowledgeAlert']);
            Route::post('/regenerate-alerts', [IntelligenceController::class, 'regenerateAlerts']);
            Route::get('/districts',      [IntelligenceController::class, 'districts']);
            Route::get('/map',            [IntelligenceController::class, 'map']);
        });

        // ━━━ ATTACK RESPONSES (NUEVO en v2) ━━━━━━━━━━━━━━━━━━━━━━━━━━
        Route::get   ('/attack-responses',      [AttackResponseController::class, 'index']);
        Route::post  ('/attack-responses',      [AttackResponseController::class, 'store']);
        Route::put   ('/attack-responses/{id}', [AttackResponseController::class, 'update']);
        Route::delete('/attack-responses/{id}', [AttackResponseController::class, 'destroy']);

        // ━━━ EXTERNAL SIGNALS (NUEVO en v2) ━━━━━━━━━━━━━━━━━━━━━━━━━━
        // El POST de ingest está fuera de este grupo (key dedicada, ver arriba)
        Route::get('/external-signals', [ExternalSignalController::class, 'index']);

        // Plan del tenant
        Route::get('/plan', [PlanController::class, 'adminShow']);

        // Ciudadanos registrados
        Route::get('/citizens',        [CitizenController::class, 'adminIndex']);
        Route::get('/citizens/export', [CitizenController::class, 'export']);

        // Perfil del candidato
        Route::get('/candidate-profile', [CandidateProfileController::class, 'adminShow']);
        Route::put('/candidate-profile', [CandidateProfileController::class, 'update']);
        Route::get('/branding',          [CandidateProfileController::class, 'branding']);
        Route::get   ('/candidate-presets',               [CandidateProfileController::class, 'listPresets']);
        Route::post  ('/candidate-presets',               [CandidateProfileController::class, 'createPreset']);
        Route::post  ('/candidate-presets/{id}/activate', [CandidateProfileController::class, 'activatePreset']);
        Route::delete('/candidate-presets/{id}',          [CandidateProfileController::class, 'deletePreset']);

        // IA
        Route::get ('/ai-settings',      [AiSettingController::class, 'show']);
        Route::put ('/ai-settings',      [AiSettingController::class, 'update']);
        Route::post('/ai-settings/test', [AiSettingController::class, 'test']);

        // Distritos
        Route::get   ('/districts',      [DistrictController::class, 'index']);
        Route::post  ('/districts',      [DistrictController::class, 'store']);
        Route::put   ('/districts/{id}', [DistrictController::class, 'update']);
        Route::delete('/districts/{id}', [DistrictController::class, 'destroy']);

        // Temas
        Route::get   ('/topics',      [TopicController::class, 'index']);
        Route::post  ('/topics',      [TopicController::class, 'store']);
        Route::put   ('/topics/{id}', [TopicController::class, 'update']);
        Route::delete('/topics/{id}', [TopicController::class, 'destroy']);

        // Preguntas sugeridas
        Route::get   ('/suggested-questions',      [SuggestedQuestionController::class, 'index']);
        Route::post  ('/suggested-questions',      [SuggestedQuestionController::class, 'store']);
        Route::put   ('/suggested-questions/{id}', [SuggestedQuestionController::class, 'update']);
        Route::delete('/suggested-questions/{id}', [SuggestedQuestionController::class, 'destroy']);

        // Proposals
        Route::get   ('/proposals',      [AdminController::class, 'listProposals']);
        Route::post  ('/proposals',      [AdminController::class, 'storeProposal']);
        Route::put   ('/proposals/{id}', [AdminController::class, 'updateProposal']);
        Route::delete('/proposals/{id}', [AdminController::class, 'deleteProposal']);

        // Videos URL
        Route::get   ('/videos',      [AdminController::class, 'listVideos']);
        Route::post  ('/videos',      [AdminController::class, 'storeVideo']);
        Route::put   ('/videos/{id}', [AdminController::class, 'updateVideo']);
        Route::delete('/videos/{id}', [AdminController::class, 'deleteVideo']);

        // FAQs
        Route::get   ('/faqs',      [AdminController::class, 'listFaqs']);
        Route::post  ('/faqs',      [AdminController::class, 'storeFaq']);
        Route::put   ('/faqs/{id}', [AdminController::class, 'updateFaq']);
        Route::delete('/faqs/{id}', [AdminController::class, 'deleteFaq']);

        // Users
        Route::get   ('/users',      [AdminController::class, 'listUsers']);
        Route::post  ('/users',      [AdminController::class, 'storeUser']);
        Route::put   ('/users/{id}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{id}', [AdminController::class, 'deleteUser']);

        // Chat sessions (solo lectura)
        Route::get('/chat-sessions',      [AdminController::class, 'listSessions']);
        Route::get('/chat-sessions/{id}', [AdminController::class, 'showSession']);

        // Galería
        Route::get   ('/gallery',      [GalleryController::class, 'adminIndex']);
        Route::post  ('/gallery',      [GalleryController::class, 'store']);
        Route::put   ('/gallery/{id}', [GalleryController::class, 'update']);
        Route::delete('/gallery/{id}', [GalleryController::class, 'destroy']);

        // Videos de campaña
        Route::get   ('/campaign-videos',      [CampaignVideoController::class, 'adminIndex']);
        Route::post  ('/campaign-videos',      [CampaignVideoController::class, 'store']);
        Route::put   ('/campaign-videos/{id}', [CampaignVideoController::class, 'update']);
        Route::delete('/campaign-videos/{id}', [CampaignVideoController::class, 'destroy']);

        // Hero settings
        Route::get ('/hero-settings',              [HeroSettingController::class, 'adminShow']);
        Route::put ('/hero-settings',              [HeroSettingController::class, 'update']);
        Route::post('/hero-settings/upload-video', [HeroSettingController::class, 'uploadVideo']);

        // Eventos
        Route::get   ('/events',      [EventController::class, 'adminIndex']);
        Route::post  ('/events',      [EventController::class, 'store']);
        Route::put   ('/events/{id}', [EventController::class, 'update']);
        Route::delete('/events/{id}', [EventController::class, 'destroy']);

        // Equipo
        Route::get   ('/team-members',      [TeamMemberController::class, 'adminIndex']);
        Route::post  ('/team-members',      [TeamMemberController::class, 'store']);
        Route::put   ('/team-members/{id}', [TeamMemberController::class, 'update']);
        Route::delete('/team-members/{id}', [TeamMemberController::class, 'destroy']);

        // Configuración home
        Route::get('/settings', [SettingController::class, 'adminIndex']);
        Route::put('/settings', [SettingController::class, 'update']);

        // Live Streams (admin)
        Route::get   ('/livestreams',                          [LiveStreamController::class, 'adminIndex']);
        Route::post  ('/livestreams',                          [LiveStreamController::class, 'store']);
        Route::put   ('/livestreams/{id}',                     [LiveStreamController::class, 'update']);
        Route::delete('/livestreams/{id}',                     [LiveStreamController::class, 'destroy']);
        Route::post  ('/livestreams/{id}/start',               [LiveStreamController::class, 'start']);
        Route::post  ('/livestreams/{id}/stop',                [LiveStreamController::class, 'stop']);
        Route::post  ('/livestreams/{key}/chunk',              [LiveStreamController::class, 'uploadChunk']);
        Route::get   ('/livestreams/{id}/viewers',             [LiveStreamController::class, 'viewers']);

        // Onboarding (wizard de primer uso)
        Route::get ('/onboarding/status',   [OnboardingController::class, 'status']);
        Route::post('/onboarding/complete', [OnboardingController::class, 'complete']);

        // Base de conocimiento
        Route::get   ('/knowledge',      [KnowledgeDocumentController::class, 'index']);
        Route::post  ('/knowledge',      [KnowledgeDocumentController::class, 'store']);
        Route::put   ('/knowledge/{id}', [KnowledgeDocumentController::class, 'update']);
        Route::delete('/knowledge/{id}', [KnowledgeDocumentController::class, 'destroy']);
        Route::post  ('/knowledge/{id}/reindex', [KnowledgeDocumentController::class, 'reindex']);
    });
});

// ─── Super Admin (sin tenant) ─────────────────────────────────────────
Route::middleware(['throttle:30,1', \App\Http\Middleware\EnsureSuperAdmin::class])
    ->prefix('superadmin')
    ->group(function () {
        Route::get   ('/tenants',              [SuperAdminController::class, 'listTenants']);
        Route::post  ('/tenants/provision',  [SuperAdminController::class, 'provision']);
        Route::post  ('/tenants',            [SuperAdminController::class, 'storeTenant']);
        Route::put   ('/tenants/{id}',       [SuperAdminController::class, 'updateTenant']);
        Route::delete('/tenants/{id}',       [SuperAdminController::class, 'destroyTenant']);
        Route::get   ('/tenants/{id}/stats',          [SuperAdminController::class, 'tenantStats']);
        Route::get   ('/plans',                       [PlanController::class, 'listPlans']);
        Route::put   ('/plans/{id}',                  [PlanController::class, 'updatePlan']);
        Route::get   ('/tenants/{id}/plan',           [PlanController::class, 'tenantPlan']);
        Route::put   ('/tenants/{id}/plan',           [PlanController::class, 'updateTenantPlan']);
        Route::get   ('/tenants/{id}/credentials',    [SuperAdminController::class, 'getCredentials']);
        Route::post  ('/tenants/{id}/reset-password', [SuperAdminController::class, 'resetPassword']);
    });
