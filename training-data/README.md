# Training Data — Segunda Vuelta 7 de junio 2026

Datos de entrenamiento de los dos candidatos cargados como seeders Laravel:

```
training-data/
├── README.md                        (este archivo)
├── keiko/
│   └── KeikoSeeder.php             (tenant Keiko Fujimori — Fuerza Popular)
└── roberto_sanchez/
    └── RobertoSanchezSeeder.php    (tenant Roberto Sánchez — Juntos por el Perú)
```

## Qué contiene cada seeder

Cada seeder es **un único archivo PHP** que carga TODO lo necesario para que el chatbot del candidato funcione el día 1:

| Bloque | Keiko | Roberto Sánchez |
|---|---|---|
| Perfil del candidato (biografía + personalidad + frases firma) | ✅ | ✅ |
| Propuestas reales del plan oficial | 30 | 30 |
| FAQs (preguntas más comunes con respuestas listas) | 25 | 23 |
| Plantillas de respuesta a ataques específicos | 15 | 15 |
| Topics adicionales | ✅ | ✅ |

Las plantillas de ataque son **instrucciones a la IA**, no texto literal — la IA las lee y construye una respuesta natural usando el plan de gobierno (RAG) y el contexto del visitante.

## Cómo agregar un candidato nuevo

Flujo vigente (multi-tenant con `tenant:provision`, ciclo octubre 2026 en adelante):

### 1. Provisionar el tenant

```bash
php artisan tenant:provision <slug> "<Nombre de la campaña>" <db_name> <admin_email> <admin_password> --plan=starter --force
```

Crea la BD, corre migraciones, siembra los datos base (topics, ai_settings,
plantillas de ataque genéricas) y registra el tenant. También se puede hacer
desde el panel `/superadmin` (pestaña Provisionar).

### 2. Crear el seeder del candidato

```bash
mkdir training-data/<slug>
cp training-data/keiko/KeikoSeeder.php training-data/<slug>/<Slug>Seeder.php
```

Renombra la clase y rellena los cinco bloques (usa el seeder de Keiko como
referencia de profundidad — esos volúmenes demostraron funcionar):

| Bloque | Método | Volumen recomendado |
|---|---|---|
| Perfil (bio + personalidad + frases firma) | `seedProfile()` | 1 |
| Topics con keywords | `seedTopics()` | 5-10 |
| Propuestas del plan oficial | `seedProposals()` | ~30 |
| FAQs con respuestas listas | `seedFaqs()` | ~25 |
| Plantillas de ataque específicas | `seedAttackResponses()` | ~15 |

Las plantillas específicas se superponen a las genéricas por mayor `priority`.
La invalidación de caché del final debe usar la clave por tenant:
`Cache::forget(TenantContext::cacheKey('attack_responses_map'))`.

### 3. Ejecutar el seeder contra la BD del tenant

```bash
cp training-data/<slug>/<Slug>Seeder.php database/seeders/

php artisan tinker
>>> \App\Services\TenantContext::run('<slug>', fn () => Artisan::call('db:seed', ['--class' => '<Slug>Seeder', '--force' => true]));
```

`TenantContext::run()` cambia la conexión a la BD del tenant y la restaura al
salir — no hace falta editar el `.env`.

### 4. Carga manual desde `/admin/` del tenant

Plan de gobierno PDF (`/admin/knowledge` — se chunkea e indexa solo), videos,
galería, hero settings y equipo. Ver sección "Lo que NO está en los seeders".

### 5. Smoke test

Igual que los ejemplos de la sección de smoke test de abajo, apuntando al
subdominio del tenant (o con header `X-Tenant: <slug>` en desarrollo).
Verifica los indicadores de éxito de la sección "Cómo saber si el chatbot
quedó bien entrenado".

### 6. Monitoreo externo (instancia de ingest del candidato)

El provisioning ya generó `ingest/instances/<slug>.env` con aliases derivados
del nombre del tenant. Afínalos con los del candidato real y levanta la
instancia (cada candidato corre la suya, con su propio broker):

```bash
# Afinar aliases/keywords (regenerable las veces que haga falta)
php artisan tenant:ingest-config <slug> \
  --aliases="nombre apellido,apellido" \
  --keywords="nombre apellido alcalde,elecciones <region> 2026"

# Levantar la instancia (requiere el stack base de Qdrant arriba:
# cd ingest && docker compose up -d)
cd ingest && docker compose -f docker-compose.instance.yml \
  -p ingest-<slug> --env-file instances/<slug>.env up -d
```

Las señales aparecen en `/admin/external-signals` y alimentan el feed de
ataques del panel de inteligencia del tenant.

## Cómo se ejecutan (flujo histórico de la 2da vuelta, pre `tenant:provision`)

Ya copiaste los archivos del patch al backend. Ahora:

### Para Keiko (subdominio `keiko.politicos.pe`, DB `sistema_politicos_keiko`)

```bash
cd /var/www/PoliticOS/backend

# Copiar el seeder a la ubicación correcta
cp /ruta/al/zip/training-data/keiko/KeikoSeeder.php database/seeders/

# Conectar al tenant Keiko y correr el seeder
php artisan tinker
>>> config(['database.connections.tenant.database' => 'sistema_politicos_keiko']);
>>> DB::purge('tenant');
>>> Artisan::call('migrate', ['--database' => 'tenant', '--force' => true]);
>>> Artisan::call('db:seed', ['--class' => 'DatabaseSeederV2', '--database' => 'tenant', '--force' => true]);
>>> Artisan::call('db:seed', ['--class' => 'KeikoSeeder', '--database' => 'tenant', '--force' => true]);
>>> exit
```

### Para Roberto Sánchez (subdominio `jp.politicos.pe`, DB `sistema_politicos_jp`)

```bash
cp /ruta/al/zip/training-data/roberto_sanchez/RobertoSanchezSeeder.php database/seeders/

php artisan tinker
>>> config(['database.connections.tenant.database' => 'sistema_politicos_jp']);
>>> DB::purge('tenant');
>>> Artisan::call('migrate', ['--database' => 'tenant', '--force' => true]);
>>> Artisan::call('db:seed', ['--class' => 'DatabaseSeederV2', '--database' => 'tenant', '--force' => true]);
>>> Artisan::call('db:seed', ['--class' => 'RobertoSanchezSeeder', '--database' => 'tenant', '--force' => true]);
>>> exit
```

### Si NO tienes helper de tenant CLI

Conecta manualmente cambiando temporalmente el `.env`:

```bash
# Edita .env temporalmente
DB_DATABASE=sistema_politicos_keiko

php artisan migrate --force
php artisan db:seed --class=DatabaseSeederV2 --force
php artisan db:seed --class=KeikoSeeder --force

# Vuelve a la DB original o pasa al siguiente tenant
DB_DATABASE=sistema_politicos_jp
php artisan migrate --force
php artisan db:seed --class=DatabaseSeederV2 --force
php artisan db:seed --class=RobertoSanchezSeeder --force
```

## Smoke test después del seed

Una vez ejecutados los seeders:

```bash
# Test Keiko
curl -X POST https://keiko.politicos.pe/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Qué propones contra la extorsión?","consent":true}'

# Debería responder con la Unidad Élite Anti-Extorsión, cooperación FBI/DEA, etc.

# Test JP
curl -X POST https://jp.politicos.pe/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Vas a expropiar empresas?","consent":true}'

# Debería negar expropiación, mencionar economía mixta y eliminación de Contratos Ley.
```

Test de ataques (verifica que las plantillas defensivas activan):

```bash
# Test Keiko — ataque "Odebrecht"
curl -X POST https://keiko.politicos.pe/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Pero tú no estás involucrada en Odebrecht?","consent":true}'

# Debería reconocer la pregunta como legítima, mencionar el archivo del expediente, NO defenderse atacando, y redirigir a propuesta de transparencia.

# Test JP — ataque "comunista"
curl -X POST https://jp.politicos.pe/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿No eres comunista chavista?","consent":true}'

# Debería rechazar la etiqueta importada, mencionar economía mixta, dar ejemplo de Bolivia.
```

## Lo que NO está en los seeders (carga manual desde el admin)

Estos elementos requieren subida manual desde `/admin/`:

1. **Plan de gobierno PDF oficial** → `/admin/knowledge` (sube ambos PDFs en los respectivos tenants):
   - Keiko: https://declara.jne.gob.pe (búscalo en JNE)
   - Roberto Sánchez: https://www.robertosanchezjp.com/docs/plan-gobierno.pdf
2. **Videos de campaña** → `/admin/campaign-videos` (Keiko cierre Villa El Salvador, JP visita Chota, etc.)
3. **Galería fotográfica** → `/admin/gallery`
4. **Hero settings con video de fondo del candidato** → `/admin/hero-settings`
5. **Equipo de campaña** → `/admin/team-members`

## Si necesitas actualizar el plan de gobierno

Los planes oficiales pueden tener correcciones de última hora. Cuando subas el PDF a `/admin/knowledge`, el sistema:

1. Extrae texto del PDF automáticamente (hasta 80,000 caracteres).
2. Lo chunkea (~500 palabras por chunk con overlap de 50).
3. Lo indexa en MySQL FULLTEXT (o Qdrant si activaste el driver).
4. El RAG lo encuentra automáticamente cuando el ciudadano pregunte por temas relacionados.

NO necesitas re-correr seeders — el plan se actualiza con solo subir el nuevo PDF.

## Cómo saber si el chatbot quedó bien entrenado

Indicadores de éxito tras smoke test:

- ✅ Responde con frases firma del candidato (Keiko: "Vamos a poner orden"; Sánchez: "Que nadie se quede atrás")
- ✅ Cita cifras concretas de las propuestas (no inventa números)
- ✅ Si le preguntas "¿eres Keiko?" / "¿eres Roberto?" responde con divulgación obligatoria (no afirma ser la persona real)
- ✅ Ataques se detectan: `attackDetected: true` en la respuesta
- ✅ Diferencia con el rival sin insultar
- ✅ El badge "Asistente IA · No es el candidato en persona" aparece en el chat

Indicadores de problema:

- ❌ Inventa cifras o promesas que no están en las propuestas → Hector debe revisar el RAG (¿se está indexando bien el PDF?)
- ❌ Insulta al rival → Hector debe revisar que la regla #3 del system prompt esté siendo aplicada
- ❌ No reconoce ataques → Cache de attack_responses sin invalidar; correr `php artisan cache:clear`
- ❌ Latencia >5 segundos → Switching de proveedor IA; revisar logs de queue worker

## Estrategia para los 17 días previos al 7 de junio

**Día 1-3 (hoy hasta 24 may):** Lanzamiento como comparador ciudadano neutral en `politicos.pe`. Landing pública "Conoce a los dos candidatos antes de votar". Sin sesgo aparente.

**Día 4-10 (25 may - 31 may):** Push viral en redes orgánicas. Cards compartibles tipo "Esto me respondió Keiko sobre seguridad". Métricas: conversaciones por día, sentiment, segmentos detectados, regiones.

**Día 11-15 (1 jun - 5 jun):** Refinamiento de respuestas basado en feedback. Revisión del feed de ataques externos (RSS, redes) para anticipar nuevas líneas de cuestionamiento. Hot-fix de plantillas si surge un tema nuevo.

**Día 16 (6 jun):** Veda electoral. Banner "Hoy es veda. El chat reabre el lunes 8". (Middleware ya incluido en LEGAL_COMPLIANCE.md)

**Día 17 (7 jun):** Día de elección. Sistema queda como referencia ciudadana, sin operación nueva.

**Post 7 de junio:** Caso de éxito documentado. Métricas reales: cuántas conversaciones, cuántos ciudadanos informados, cuántas regiones. Material de venta para octubre 2026 (elecciones regionales y municipales) — el verdadero mercado SaaS de PoliticOS.

---

Cualquier propuesta nueva que aparezca en los próximos 17 días, o ataque inesperado de algún medio, lo manejas desde `/admin/proposals` y `/admin/attack-responses` sin necesidad de tocar código.
