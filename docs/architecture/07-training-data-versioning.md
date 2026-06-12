# 07 — Decisión: versionar `training-data/`

**Fecha**: 2026-06-12 · **Estado**: aplicada · **Contexto**: bloque D2 de limpieza post-electoral

## Decisión

`training-data/` **se versiona en git** (se retiró la entrada `/training-data/` del
`.gitignore`). Incluye los seeders completos de Keiko Fujimori y Roberto Sánchez
y el README operativo de la segunda vuelta del 7 jun 2026.

## Por qué

1. **El riesgo dominante era la pérdida, no la exposición.** La carpeta estaba en
   `.gitignore`, así que la única copia vivía en un disco local sin respaldo —
   mientras `03-target-architecture.md` la define como "repositorio histórico,
   nunca borrar" y `02-separation-map.md` ordena "mantener como repositorio".
   Un repositorio sin backup contradice esa intención.
2. **El repo es privado** (verificado 2026-06-12: GitHub devuelve 404 sin
   autenticación). No hay exposición pública.
3. **No contiene datos personales de ciudadanos.** Son biografías públicas,
   propuestas de los planes oficiales, FAQs y plantillas de respuesta a ataques.
   Lo sensible es **estrategia de campaña de clientes**, no PII.
4. **La elección ya pasó** (7 jun 2026): el material es histórico y sirve como
   base/caso de éxito para el ciclo de octubre 2026 (regionales y municipales).

## Condición de reversa

Si el repositorio se hace **público** algún día, `training-data/` debe extraerse
antes (a un repo privado aparte o storage cifrado): las plantillas de ataque y la
estrategia de lanzamiento del README son confidenciales de los clientes.

## Qué quedó versionado

```
training-data/
├── README.md                          # operativa de seeders + estrategia 2da vuelta
├── keiko/KeikoSeeder.php              # perfil + 30 propuestas + 25 FAQs + 15 plantillas
└── roberto_sanchez/RobertoSanchezSeeder.php  # perfil + 30 propuestas + 23 FAQs + 15 plantillas
```
