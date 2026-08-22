<?php

namespace Tests\Unit;

use App\Http\Middleware\ThrottleChatBySession;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * feat/cuotas-ia — ThrottleChatBySession: reemplaza el throttle:30,1,chat por
 * IP con dos límites propios de la sesión de chat (10 mensajes de por vida,
 * 30/hora). ChatSession/ChatMessage viven en la conexión por defecto
 * ('mysql' en tests — no hay tenant resuelto/ResolveTenant en estos tests
 * directos a middleware, así que no hace falta declarar $connectionsToTransact).
 *
 * Cada test usa un session_id único (uniqid()) para no compartir el bucket
 * de RateLimiter (cache "array", persiste durante todo el proceso de test)
 * entre casos.
 */
class ThrottleChatBySessionTest extends TestCase
{
    use DatabaseTransactions;

    private function callMiddleware(string $sessionId): \Symfony\Component\HttpFoundation\Response
    {
        $request = Request::create('/api/chat', 'POST', [
            'message'    => 'hola',
            'session_id' => $sessionId,
        ]);
        $middleware = new ThrottleChatBySession();

        return $middleware->handle($request, fn ($r) => response()->json(['ok' => true]));
    }

    // ─── Tope de por vida (10 mensajes) ────────────────────────────────────

    public function test_deja_pasar_una_sesion_nueva_sin_mensajes_previos(): void
    {
        $response = $this->callMiddleware('sess-' . uniqid());

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_deja_pasar_hasta_9_mensajes_previos_bloquea_en_el_10(): void
    {
        $sessionId = 'sess-' . uniqid();
        $session   = ChatSession::create(['session_id' => $sessionId, 'started_at' => now()]);

        // 9 mensajes de usuario ya guardados → el próximo (el 10º) debe pasar,
        // pero al llegar a 10 ya guardados el siguiente (11º) debe bloquear.
        for ($i = 0; $i < 9; $i++) {
            ChatMessage::create(['session_id' => $session->id, 'role' => 'user', 'content' => "msg {$i}"]);
        }
        $response = $this->callMiddleware($sessionId);
        $this->assertSame(200, $response->getStatusCode(), 'con 9 previos, el mensaje 10 debe pasar');

        ChatMessage::create(['session_id' => $session->id, 'role' => 'user', 'content' => 'msg 10']);
        $response = $this->callMiddleware($sessionId);
        $this->assertSame(429, $response->getStatusCode(), 'con 10 previos, el mensaje 11 debe bloquear');
        $this->assertStringContainsString(
            'límite de mensajes',
            json_decode($response->getContent(), true)['message']
        );
    }

    public function test_solo_cuenta_mensajes_role_user_no_assistant(): void
    {
        $sessionId = 'sess-' . uniqid();
        $session   = ChatSession::create(['session_id' => $sessionId, 'started_at' => now()]);

        // 10 mensajes del assistant no deben contar contra el tope del usuario.
        for ($i = 0; $i < 10; $i++) {
            ChatMessage::create(['session_id' => $session->id, 'role' => 'assistant', 'content' => "resp {$i}"]);
        }

        $response = $this->callMiddleware($sessionId);

        $this->assertSame(200, $response->getStatusCode());
    }

    // ─── Tope por hora (30/hora) ────────────────────────────────────────────

    public function test_bloquea_al_superar_30_mensajes_en_la_hora(): void
    {
        $sessionId = 'sess-' . uniqid();

        for ($i = 0; $i < 30; $i++) {
            $response = $this->callMiddleware($sessionId);
            $this->assertSame(200, $response->getStatusCode(), "intento {$i} debía pasar");
        }

        $response = $this->callMiddleware($sessionId);

        $this->assertSame(429, $response->getStatusCode());
        $this->assertStringContainsString(
            'Demasiados mensajes',
            json_decode($response->getContent(), true)['message']
        );
        $this->assertTrue($response->headers->has('Retry-After'));
    }

    // ─── Clave de fallback cuando no hay session_id (primer mensaje) ──────

    public function test_sin_session_id_usa_cookie_de_visitante_como_clave_y_deja_pasar(): void
    {
        $request = Request::create('/api/chat', 'POST', ['message' => 'hola']);
        $request->cookies->set('politicos_visitor_id', 'visitor-' . uniqid());

        $response = (new ThrottleChatBySession())->handle($request, fn ($r) => response()->json(['ok' => true]));

        $this->assertSame(200, $response->getStatusCode());
    }
}
