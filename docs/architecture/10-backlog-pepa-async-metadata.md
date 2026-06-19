# 10 — Backlog: extraer `metadata_interna` de PEPA en una segunda llamada async

**Estado**: backlog (propuesto 2026-06-19) · no implementado
**Prioridad**: media · **Esfuerzo estimado**: M (cambio estructural)
**Relacionado**: `app/Services/CivicAIService.php`, `app/Http/Controllers/ChatController.php`, `resources/prompts/pepa_prompt.txt`

## Contexto

Hoy, en modo PEPA, una sola llamada al LLM (Groq/Llama) genera en un mismo JSON
tanto `respuesta_usuario` (lo que ve el ciudadano) como `metadata_interna` (señales
de perfilamiento). Esto acopla dos preocupaciones con costos distintos:

- `respuesta_usuario` es lo único que el usuario espera y debe llegar rápido.
- `metadata_interna` es analítica del tenant, no urgente, y no debería bloquear
  ni arriesgar la respuesta visible.

### Fixes ya aplicados (que esto haría innecesarios en parte)

Esta opción quedó como backlog tras resolver el problema inmediato con dos fixes
de bajo esfuerzo (ver commit `fix/pepa-json-leak-and-truncation`):

1. **Anti-leak**: `parseAIResponse()` nunca expone el JSON crudo al usuario; si el
   parseo falla en modo PEPA, loguea el raw y devuelve un mensaje genérico.
2. **Anti-truncamiento**: piso de `max_tokens` (`effectiveMaxTokens()`, 1200 en
   PEPA) + schema recortado (se quitaron `argumento_decisivo` y
   `siguiente_pregunta_sugerida`, sin consumo downstream) + JSON compacto.

## Propuesta

Separar la generación en dos pasos:

1. **Respuesta al usuario (camino crítico)**: una llamada ligera que produce solo
   `respuesta_usuario` en texto plano (sin envoltorio JSON). Menor latencia
   percibida, menor riesgo de truncamiento, sin overhead de schema.
2. **Metadata (fire-and-forget, después de responder)**: un job en cola
   (`AnalyzeMessageJob` ya existe y corre `afterResponse()`) hace una segunda
   llamada barata que extrae `metadata_interna` a partir del turno del usuario +
   la respuesta ya emitida, y persiste en `chat_messages.pepa_metadata` /
   `chat_sessions` vía la lógica actual de `applyPepaMetaToSession()`.

## Beneficios

- Elimina de raíz el truncamiento del JSON estructurado (la respuesta visible ya
  no comparte presupuesto de tokens con la metadata).
- Mejora la latencia percibida del chat.
- Permite usar un modelo/temperatura distinto y más barato para la extracción de
  metadata (tarea de clasificación, no de redacción).

## Costos / riesgos a evaluar

- **Doble request por mensaje**: más llamadas (aunque cada una más pequeña).
  Medir costo agregado vs. el actual de una sola llamada con techo 1200.
- **Consistencia**: la metadata se basa en la respuesta ya emitida; validar que
  `region_confirmada`, `postura_actual`, `cambio_de_opinion`, `tema_dominante` y
  `fuentes_citadas` se infieran con calidad equivalente en la segunda pasada.
- `fuentes_citadas` hoy se usa para adjuntar media en el mismo turno; si se mueve
  a async, decidir si las fuentes se siguen resolviendo en el camino crítico
  (probablemente sí, derivándolas del contexto RAG, no del LLM).

## Decisión pendiente vinculada

Antes (o como parte) de esto, decidir el destino de `nse_inferido` y
`emocion_dominante`: hoy se persisten pero **ningún código los lee**. Opciones:
(a) cablearlos a analytics/lead-scoring y justificar su costo de tokens, o
(b) eliminarlos del schema como se hizo con los otros campos muertos.

## Criterio de aceptación

- [ ] La respuesta visible al usuario no depende de generar metadata.
- [ ] `metadata_interna` sigue persistiéndose con calidad equivalente vía job async.
- [ ] Medición antes/después de latencia percibida y costo por conversación.
- [ ] Tests que cubran: respuesta visible sin JSON, y job de metadata poblando
      `chat_sessions` (postura/región/cambio_de_opinion).
