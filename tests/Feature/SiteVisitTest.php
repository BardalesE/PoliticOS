<?php

namespace Tests\Feature;

use App\Models\SiteVisitor;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Contador público de visitas únicas por IP (GET/POST /api/site-visits).
 *
 * La tabla vive en la conexión `central`; aquí se apunta a un SQLite en memoria
 * y se corre la migración real, así el test no depende de MySQL.
 */
class SiteVisitTest extends TestCase
{
    private const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

    protected function setUp(): void
    {
        parent::setUp();

        config(['database.connections.central' => [
            'driver'                  => 'sqlite',
            'database'                => ':memory:',
            'prefix'                  => '',
            'foreign_key_constraints' => true,
        ]]);
        DB::purge('central');

        (require database_path('migrations/2026_09_18_000001_create_site_visitors_table.php'))->up();

        Cache::flush();
    }

    private function visitFrom(string $ip, string $ua = self::UA, string $uri = '/api/site-visits')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->withHeader('User-Agent', $ua)
            ->postJson($uri);
    }

    public function test_new_ip_is_counted(): void
    {
        $this->visitFrom('203.0.113.10')
            ->assertOk()
            ->assertExactJson(['visits' => 1]);
    }

    public function test_same_ip_is_counted_only_once(): void
    {
        $this->visitFrom('203.0.113.10');
        $this->visitFrom('203.0.113.10');

        $this->visitFrom('203.0.113.10')->assertExactJson(['visits' => 1]);
        $this->assertSame(1, SiteVisitor::count());
    }

    public function test_different_ips_are_counted_separately(): void
    {
        $this->visitFrom('203.0.113.10');
        $this->visitFrom('203.0.113.11');

        $this->visitFrom('198.51.100.7')->assertExactJson(['visits' => 3]);
    }

    public function test_client_ip_is_read_from_forwarded_header_behind_proxy(): void
    {
        // El API corre detrás del balanceador de Render (trustProxies '*').
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
            ->withHeaders(['User-Agent' => self::UA, 'X-Forwarded-For' => '203.0.113.50'])
            ->postJson('/api/site-visits')->assertExactJson(['visits' => 1]);

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
            ->withHeaders(['User-Agent' => self::UA, 'X-Forwarded-For' => '203.0.113.51'])
            ->postJson('/api/site-visits')->assertExactJson(['visits' => 2]);
    }

    public function test_raw_ip_is_never_stored(): void
    {
        $this->visitFrom('203.0.113.10');

        $stored = SiteVisitor::first()->ip_hash;

        $this->assertSame(64, strlen($stored));
        $this->assertStringNotContainsString('203.0.113.10', $stored);
    }

    public function test_ipv6_addresses_in_the_same_64_prefix_count_once(): void
    {
        $this->visitFrom('2800:200:1234:5678:aaaa:bbbb:cccc:0001');
        $this->visitFrom('2800:200:1234:5678:1111:2222:3333:4444');

        $this->assertSame(1, SiteVisitor::count());

        $this->visitFrom('2800:200:1234:9999::1')->assertExactJson(['visits' => 2]);
    }

    public function test_bots_and_empty_user_agents_are_not_counted(): void
    {
        $this->visitFrom('203.0.113.10', 'Googlebot/2.1 (+http://www.google.com/bot.html)');
        $this->visitFrom('203.0.113.11', 'curl/8.4.0');
        $this->visitFrom('203.0.113.12', '');

        $this->assertSame(0, SiteVisitor::count());
    }

    public function test_get_returns_total_without_registering_the_caller(): void
    {
        $this->visitFrom('203.0.113.10');

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.99'])
            ->withHeader('User-Agent', self::UA)
            ->getJson('/api/site-visits')
            ->assertOk()
            ->assertExactJson(['visits' => 1]);

        $this->assertSame(1, SiteVisitor::count());
    }

    public function test_unknown_tenant_param_does_not_break_the_global_counter(): void
    {
        $this->visitFrom('203.0.113.10', self::UA, '/api/site-visits?tenant=no-existe')
            ->assertOk()
            ->assertExactJson(['visits' => 1]);
    }
}
