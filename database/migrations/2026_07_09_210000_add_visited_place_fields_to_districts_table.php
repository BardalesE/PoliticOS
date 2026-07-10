<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// "Lugares Visitados" (home pública, decisión 9 jul 2026): el candidato ya
// tiene fotos/video con fecha real de cada caserío visitado, y quiere que la
// gente también vea "algo original" de cada lugar (identidad/turismo), no
// solo cobertura de campaña. Se extiende la tabla `districts` (ya es la
// fuente real de la lista de caseríos que consume la home) en vez de crear
// una tabla nueva — evita duplicar el mismo listado de nombres en dos
// lugares. Todos los campos son nullable: un distrito sigue siendo válido
// para el enrutamiento de keywords del chat sin haber sido "visitado" en
// este sentido público.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('districts', function (Blueprint $table) {
            $table->date('visited_at')->nullable()->after('is_active');
            $table->string('event_type', 100)->nullable()->after('visited_at');
            $table->text('highlight_text')->nullable()->after('event_type');
            $table->string('highlight_photo_url', 500)->nullable()->after('highlight_text');
        });
    }

    public function down(): void
    {
        Schema::table('districts', function (Blueprint $table) {
            $table->dropColumn(['visited_at', 'event_type', 'highlight_text', 'highlight_photo_url']);
        });
    }
};
