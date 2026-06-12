<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Provisionamiento completo de un tenant (candidato) en PoliticOS.
 *
 * Uso:
 *   php artisan tenant:provision james "Campaña James" bdpolitic_james admin@james.pe SecurePass!
 *
 * Opciones:
 *   --db-host=127.0.0.1
 *   --db-port=3306
 *   --db-user=politicos_user
 *   --db-password=
 *   --plan=starter|pro|elite
 *   --force   (no pide confirmación)
 */
class TenantProvision extends Command
{
    protected $signature = 'tenant:provision
        {slug      : Identificador único del tenant (solo letras, números y guiones)}
        {name      : Nombre visible del tenant (ej: "Campaña James Cueva")}
        {db_name   : Nombre de la base de datos MySQL a crear}
        {admin_email    : Email del administrador inicial del tenant}
        {admin_password : Contraseña del administrador inicial}
        {--db-host=127.0.0.1 : Host de MySQL}
        {--db-port=3306       : Puerto de MySQL}
        {--db-user=politicos_user       : Usuario de MySQL}
        {--db-password=       : Contraseña de MySQL}
        {--plan=starter       : Plan del tenant (starter|pro|elite)}
        {--force              : Ejecutar sin confirmación interactiva}';

    protected $description = 'Crea una nueva base de datos, ejecuta migraciones, siembra datos iniciales y registra el tenant.';

    public function handle(): int
    {
        $slug     = strtolower(trim($this->argument('slug')));
        $name     = trim($this->argument('name'));
        $dbName   = trim($this->argument('db_name'));
        $email    = trim($this->argument('admin_email'));
        $password = $this->argument('admin_password');
        $plan     = $this->option('plan');

        $dbHost = $this->option('db-host') ?: config('database.connections.mysql.host', '127.0.0.1');
        $dbPort = (int) ($this->option('db-port') ?: config('database.connections.mysql.port', 3306));
        $dbUser = $this->option('db-user') ?: config('database.connections.mysql.username', 'politicos_user');
        $dbPass = $this->option('db-password') !== null
            ? $this->option('db-password')
            : config('database.connections.mysql.password', '');

        // ── Validaciones ──────────────────────────────────────────────────
        if (!preg_match('/^[a-z0-9\-]{2,60}$/', $slug)) {
            $this->error("El slug '{$slug}' es inválido. Solo letras minúsculas, números y guiones.");
            return 1;
        }

        if (Tenant::where('slug', $slug)->exists()) {
            $this->error("Ya existe un tenant con el slug '{$slug}'.");
            return 1;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error("El email '{$email}' no es válido.");
            return 1;
        }

        if (!in_array($plan, ['starter', 'pro', 'elite'])) {
            $this->error("Plan inválido. Debe ser: starter, pro, elite.");
            return 1;
        }

        // ── Confirmación ─────────────────────────────────────────────────
        if (!$this->option('force') && $this->input->isInteractive()) {
            $this->table(['Campo', 'Valor'], [
                ['Slug',     $slug],
                ['Nombre',   $name],
                ['Base de datos', $dbName],
                ['DB Host',  "{$dbHost}:{$dbPort}"],
                ['DB User',  $dbUser],
                ['Admin',    $email],
                ['Plan',     $plan],
            ]);
            if (!$this->confirm('¿Continuar con el provisionamiento?')) {
                $this->info('Cancelado.');
                return 0;
            }
        }

        // ── 1. Crear la base de datos ─────────────────────────────────────
        $this->line('');
        $this->line("<fg=cyan>▶ Paso 1/4:</> Creando base de datos <fg=yellow>`{$dbName}`</>...");

        try {
            // Conexión sin database para poder hacer CREATE DATABASE
            $pdo = new \PDO(
                "mysql:host={$dbHost};port={$dbPort};charset=utf8mb4",
                $dbUser, $dbPass,
                [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]
            );
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        } catch (\Throwable $e) {
            $this->error("No se pudo crear la base de datos: " . $e->getMessage());
            return 1;
        }

        $this->line("  <fg=green>✓</> Base de datos creada.");

        // ── 2. Configurar conexión de provisioning ────────────────────────
        config([
            'database.connections.tenant_provision.driver'    => 'mysql',
            'database.connections.tenant_provision.host'      => $dbHost,
            'database.connections.tenant_provision.port'      => $dbPort,
            'database.connections.tenant_provision.database'  => $dbName,
            'database.connections.tenant_provision.username'  => $dbUser,
            'database.connections.tenant_provision.password'  => $dbPass,
            'database.connections.tenant_provision.charset'   => 'utf8mb4',
            'database.connections.tenant_provision.collation' => 'utf8mb4_unicode_ci',
            'database.connections.tenant_provision.prefix'    => '',
        ]);
        DB::purge('tenant_provision');

        // ── 3. Ejecutar migraciones ───────────────────────────────────────
        $this->line('');
        $this->line("<fg=cyan>▶ Paso 2/4:</> Ejecutando migraciones...");

        try {
            Artisan::call('migrate', [
                '--database' => 'tenant_provision',
                '--force'    => true,
            ]);
            // Contar migraciones ejecutadas consultando la tabla migrations en el tenant
            $migCount = DB::connection('tenant_provision')->table('migrations')->count();
            $this->line("  <fg=green>✓</> {$migCount} migraciones completadas.");
        } catch (\Throwable $e) {
            $this->cleanupDb($dbName, $dbHost, $dbPort, $dbUser, $dbPass);
            $this->error("Error en migraciones: " . $e->getMessage());
            return 1;
        }

        // ── 4. Sembrar datos iniciales ────────────────────────────────────
        $this->line('');
        $this->line("<fg=cyan>▶ Paso 3/4:</> Sembrando datos iniciales...");

        try {
            $conn = DB::connection('tenant_provision');
            $now  = now()->toDateTimeString();
            // Nombre del candidato = el argumento {name} que recibe el comando.
            // Ej: "Maria Garcia", "Keiko Fujimori", "Roberto Sanchez"
            $candidateName = $name;

            // Admin user
            $conn->table('users')->insert([
                'name'              => 'Administrador',
                'email'             => $email,
                'password'          => Hash::make($password),
                'role'              => 'admin',
                'email_verified_at' => $now,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);

            // Candidate profile (placeholder) — is_active=true so it's picked up immediately
            $conn->table('candidate_profiles')->insert([
                'name'          => $candidateName,
                'title'         => 'Candidato a la Alcaldía',
                'location'      => 'Por definir',
                'party'         => 'Por definir',
                'list_number'   => '1',
                'bio'           => "Perfil de {$candidateName}. Editar desde el panel de administración.",
                'tagline'       => 'Por el bien de todos',
                'election_date' => '4 de octubre de 2026',
                'color_primary' => '#0F52BA',
                'color_dark'    => '#1A365D',
                'color_accent'  => '#C9A84C',
                'is_active'     => true,
                'preset_name'   => 'Candidato principal',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);

            // AI Setting — modo PEPA (asistente cívico) por defecto para tenants
            // nuevos; el modo campaña es opt-in desde /admin/ai-settings.
            $promptPath = base_path('resources/prompts/pepa_prompt.txt');
            $prompt = file_exists($promptPath) ? file_get_contents($promptPath) : 'Eres un asistente cívico neutral.';

            $conn->table('ai_settings')->insert([
                'provider'          => 'groq',
                'model'             => 'llama-3.3-70b-versatile',
                'fallback_provider' => 'claude',
                'temperature'       => 0.65,
                'max_tokens'        => 700,
                'system_prompt'     => $prompt,
                'mode'              => 'pepa',
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);

            // Hero settings
            $firstName = explode(' ', trim($candidateName))[0];
            $conn->table('hero_settings')->insert([
                'title'           => "Habla con {$firstName}",
                'subtitle'        => "Conoce las propuestas de {$candidateName} y lo que hará por tu distrito.",
                'overlay_opacity' => 0.70,
                'overlay_color'   => '#DC2626',
                'is_active'       => true,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);

            // Topics (16 temas para detección de IA)
            $this->seedTopics($conn, $now);

            // Attack responses (plantillas genéricas)
            $this->seedAttackResponses($conn, $now);

            $this->line("  <fg=green>✓</> Datos sembrados correctamente.");
        } catch (\Throwable $e) {
            $this->cleanupDb($dbName, $dbHost, $dbPort, $dbUser, $dbPass);
            $this->error("Error sembrando datos: " . $e->getMessage());
            return 1;
        }

        // ── 5. Registrar tenant en DB principal ───────────────────────────
        $this->line('');
        $this->line("<fg=cyan>▶ Paso 4/4:</> Registrando tenant en base de datos principal...");

        try {
            $tenant = Tenant::create([
                'slug'                => $slug,
                'name'                => $name,
                'db_name'             => $dbName,
                'db_host'             => $dbHost,
                'db_port'             => $dbPort,
                'db_user'             => $dbUser,
                'db_password'         => $dbPass,
                'plan'                => $plan,
                'is_active'           => true,
                'admin_email'         => $email,
                'admin_password_hint' => \Illuminate\Support\Facades\Crypt::encrypt($password),
                'password_changed_at' => null,
                'credential_log'      => '[]',
            ]);
        } catch (\Throwable $e) {
            $this->cleanupDb($dbName, $dbHost, $dbPort, $dbUser, $dbPass);
            $this->error("Error registrando tenant: " . $e->getMessage());
            return 1;
        }

        $this->line("  <fg=green>✓</> Tenant registrado (ID: {$tenant->id}).");

        // ── 5b. Config de la instancia de ingest (no fatal) ───────────────
        // Aliases derivados del nombre; se afinan luego regenerando con
        // tenant:ingest-config --aliases=...
        $ingestConfigOk = false;
        try {
            $ingestConfigOk = Artisan::call('tenant:ingest-config', [
                'slug'    => $slug,
                '--force' => true,
            ]) === 0;
        } catch (\Throwable $e) {
            $this->warn("  ⚠ Config de ingest no generada: {$e->getMessage()}");
        }
        if (!$ingestConfigOk) {
            $this->warn("  Genera la config luego con: php artisan tenant:ingest-config {$slug}");
        }

        // ── Resumen ───────────────────────────────────────────────────────
        $this->line('');
        $this->line('<fg=green;options=bold>✓ Tenant provisionado exitosamente.</>');
        $this->table(['Campo', 'Valor'], [
            ['Tenant ID',  $tenant->id],
            ['Slug',       $slug],
            ['Nombre',     $name],
            ['Plan',       $plan],
            ['Base de datos', $dbName],
            ['Admin email', $email],
            ['URL (prod)', "https://{$slug}.politicos.pe"],
            ['URL (dev)',  "http://localhost:3000?tenant={$slug}"],
            ['Ingest env', $ingestConfigOk ? "ingest/instances/{$slug}.env" : '⚠ pendiente'],
        ]);

        $this->line('');
        $this->line('Monitoreo externo del candidato (manual):');
        $this->line("  1. Afina aliases/keywords:  <fg=cyan>php artisan tenant:ingest-config {$slug} --aliases=\"nombre apellido,apellido\" --keywords=\"nombre apellido alcalde\"</>");
        $this->line("  2. Levanta la instancia:    <fg=cyan>cd ingest && docker compose -f docker-compose.instance.yml -p ingest-{$slug} --env-file instances/{$slug}.env up -d</>");

        return 0;
    }

    private function cleanupDb(string $dbName, string $host, int $port, string $user, string $pass): void
    {
        try {
            $pdo = new \PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass);
            $pdo->exec("DROP DATABASE IF EXISTS `{$dbName}`");
            $this->warn("  Base de datos `{$dbName}` eliminada por error en el proceso.");
        } catch (\Throwable) {}
    }

    private function seedTopics(\Illuminate\Database\Connection $conn, string $now): void
    {
        $topics = [
            ['seguridad',    'Seguridad Ciudadana',  ['inseguridad','delincuencia','sicarios','asaltos','serenazgo','policía','crimen','extorsión','robo','pandillas']],
            ['economia',     'Economía y Empleo',    ['empleo','trabajo','desempleo','sueldo','impuesto','MYPE','inversión','inflación','negocio','empresa']],
            ['salud',        'Salud',                ['hospital','medicina','medicamento','enfermo','SIS','EsSalud','posta','médico','cáncer','diabetes']],
            ['educacion',    'Educación',            ['colegio','escuela','universidad','beca','profesor','maestro','estudiante','SUNEDU','PRONABEC']],
            ['agua',         'Agua y Saneamiento',   ['agua','desagüe','alcantarillado','potable','SEDAPAL','escasez','río']],
            ['transporte',   'Transporte',           ['transporte','tráfico','combi','metro','tren','pista','carretera','asfaltado']],
            ['vivienda',     'Vivienda',             ['vivienda','casa','techo propio','MiVivienda','invasión','asentamiento']],
            ['agricultura',  'Agricultura',          ['agricultor','agricultura','agro','chacra','cosecha','fertilizante','riego']],
            ['corrupcion',   'Anticorrupción',       ['corrupto','corrupción','coima','soborno','transparencia','contraloría']],
            ['pension',      'Pensiones',            ['pensión','AFP','ONP','jubilación','adulto mayor','aporte']],
            ['tecnologia',   'Tecnología',           ['internet','digitalización','IA','tecnología','digital','trámite virtual']],
            ['juventud',     'Juventud',             ['joven','jóvenes','juventud','primer empleo','egresado','tiktok']],
            ['mujer',        'Mujer',                ['mujer','feminicidio','violencia familiar','violencia de género','maternidad']],
            ['mineria',      'Minería',              ['minería','minera','mineros','canon','regalías','contaminación minera']],
            ['congreso',     'Política',             ['congreso','congresista','parlamento','disolución','vacancia']],
            ['narcotrafico', 'Narcotráfico',         ['narcotráfico','droga','cocaína','VRAEM','terrorismo']],
        ];

        foreach ($topics as [$name, $label, $keywords]) {
            $conn->table('topics')->insert([
                'name'       => $name,
                'label'      => $label,
                'keywords'   => json_encode($keywords),
                'is_active'  => true,
                'sort_order' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function seedAttackResponses(\Illuminate\Database\Connection $conn, string $now): void
    {
        $attacks = [
            ['corrupcion', ['corrupto','coima','soborno'], 'pasado',
             'Reconoce que la corrupción es la principal preocupación del peruano. NO te pongas a la defensiva. Afirma compromiso con transparencia. Redirige a propuestas concretas anticorrupción.',
             'seguridad', 90],
            ['mentiras', ['mentiroso','mentira','mientes','engañas','demagogia'], 'pasado',
             'No te defiendas atacando. Responde con datos verificables y fuentes públicas. Invita al ciudadano a leer el plan de gobierno completo.',
             null, 80],
            ['fracaso', ['fracasaste','no ganaste','perdiste'], 'pasado',
             'Reconoce el resultado con humildad. Habla de las lecciones aprendidas. Cierra con propuesta concreta del futuro.',
             null, 70],
            ['no tienes plata', ['no tienes presupuesto','de dónde','financiamiento','quien te financia'], 'propuesta',
             'Explica el modelo de financiamiento transparente. Menciona los límites legales de campaña. Redirige a propuestas con costeo claro.',
             'economia', 75],
            ['igual que los demás', ['igual que todos','igual que siempre','lo mismo de siempre','nada va a cambiar'], 'otro',
             'Valida el escepticismo del ciudadano — es legítimo. Diferénciate con 2-3 propuestas concretas con plazos y métricas. Ofrece mecanismos de rendición de cuentas.',
             null, 65],
        ];

        foreach ($attacks as [$keyword, $synonyms, $category, $template, $deflection, $priority]) {
            $conn->table('attack_responses')->insert([
                'attack_keyword'    => $keyword,
                'synonyms'          => json_encode($synonyms),
                'attack_category'   => $category,
                'response_template' => $template,
                'deflection_topic'  => $deflection,
                'priority'          => $priority,
                'times_used'        => 0,
                'is_active'         => true,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);
        }
    }
}
