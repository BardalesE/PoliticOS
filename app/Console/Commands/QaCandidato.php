<?php

namespace App\Console\Commands;

use App\Models\CandidateProfile;
use App\Services\ControlCalidadService;
use App\Services\TenantContext;
use Illuminate\Console\Command;

/**
 * Control de calidad del chat de un candidato desde la terminal (mismo motor que
 * el botón del panel admin). Ej.:
 *   php artisan qa:candidato daniel-ronaldo-monzon-ninaquispe-san-gregorio --tenant=politicosperu
 */
class QaCandidato extends Command
{
    protected $signature = 'qa:candidato
        {slug : Slug del candidato}
        {--tenant= : Slug del tenant (si no, la BD por defecto)}
        {--pausa=4 : Segundos entre casos (cuida el límite del proveedor de IA)}
        {--guardar : Guarda el resultado en el perfil (lo ve el panel admin)}';

    protected $description = 'Hace al chat de un candidato la batería de control de calidad y muestra ✅/❌ por caso';

    public function handle(ControlCalidadService $qa): int
    {
        $exit = self::FAILURE;
        $run  = function () use ($qa, &$exit) { $exit = $this->correr($qa); };

        if ($tenant = $this->option('tenant')) {
            TenantContext::run($tenant, $run);
        } else {
            $run();
        }

        return $exit;
    }

    private function correr(ControlCalidadService $qa): int
    {
        $c = CandidateProfile::where('slug', $this->argument('slug'))->first();
        if (! $c) {
            $this->error('Candidato no encontrado.');
            return self::FAILURE;
        }

        $this->info("Control de calidad — {$c->name}");
        $resumen = [];
        foreach ($qa->casos($c) as $i => $caso) {
            if ($i > 0) {
                sleep(max(0, (int) $this->option('pausa')));
            }
            $r = $qa->ejecutar($c, $caso['id']);
            if ($r['estado'] === ControlCalidadService::SIN_IA) {   // un reintento tras una pausa larga
                sleep(20);
                $r = $qa->ejecutar($c, $caso['id']);
            }

            $icono = ['ok' => '✅', 'falla' => '❌', 'sin_respuesta' => '⚠️ '][$r['estado']];
            $this->line("{$icono} {$r['titulo']}");
            $fallas = [];
            foreach ($r['checks'] as $ch) {
                if (! $ch['ok']) {
                    $fallas[] = "{$ch['nombre']}: {$ch['detalle']}";
                    $this->line("     · {$ch['nombre']} — {$ch['detalle']}");
                }
            }
            if ($r['estado'] !== 'ok' && $this->output->isVerbose()) {
                $this->line('     Respuesta: ' . str_replace("\n", ' ', mb_substr(end($r['turnos'])['respuesta'], 0, 400)));
            }
            $resumen[] = ['id' => $r['id'], 'titulo' => $r['titulo'], 'estado' => $r['estado'], 'fallas' => $fallas];
        }

        $estados = collect($resumen)->pluck('estado');
        $estado  = $estados->contains('falla') ? 'fallas' : ($estados->contains('sin_respuesta') ? 'incompleto' : 'aprobado');
        $this->newLine();
        $this->line(['aprobado' => '🟢 APROBADO', 'fallas' => '🔴 CON FALLAS — no compartir todavía', 'incompleto' => '🟡 INCOMPLETO — la IA no respondió en algunos casos'][$estado]);

        if ($this->option('guardar')) {
            $c->forceFill(['qa_estado' => $estado, 'qa_at' => now(), 'qa_resumen' => $resumen])->save();
        }

        return $estado === 'aprobado' ? self::SUCCESS : self::FAILURE;
    }
}
