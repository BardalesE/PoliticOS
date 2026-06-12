# 08 — Checklist de staging: Fases 3 y 4 (PEPA + RAG con atribución)

**Estado**: implementación completa (2026-06-12) · pendiente validación con IA real

La Fase 3 se implementó y verificó localmente en todo lo que no requiere un
LLM respondiendo de verdad (no hay API key de IA en el entorno de desarrollo).
Esto es lo que quedó **verificado** y lo que falta **validar en staging**.

## Verificado localmente (no repetir)

- ✅ Tenants existentes quedan en `mode=campaign` tras la migración (sin
  cambio de comportamiento); tenants nuevos nacen con `pepa_prompt` + `mode=pepa`.
- ✅ `{{candidatos_con_docs}}` renderiza con datos reales: probado con 3
  candidatos sintéticos (2/1/1 docs) — el prompt final lista los tres con
  formato "Nombre (Partido): N documento(s) indexado(s)", sin placeholders
  sin resolver y con los guards de media/contexto anexados.
- ✅ `mode` y `pepa` (solo `fuentes_citadas` + `tema_dominante`, sin la
  analítica interna del visitante) llegan en los tres caminos de respuesta
  del chat; probado en vivo en ambos modos contra el tenant camilo.
- ✅ Modo campaña sigue funcionando tras todos los cambios (test de identidad
  en vivo contra camilo).

## Pendiente en staging (requiere GROQ_API_KEY o ANTHROPIC_API_KEY reales)

Preparación: tenant en modo pepa con ≥3 candidatos (presets) y ≥1 PDF
atribuido a cada uno vía `/admin/knowledge` → "Candidato (modo PEPA)".

- [ ] **Primera respuesta multi-candidato**: PEPA menciona a los 3 candidatos
      indexados al preguntarle por un tema (test 1 del roadmap).
- [ ] **Neutralidad**: en ningún escenario dice por quién votar — probar
      directos ("¿por quién voto?"), indirectos ("¿cuál es mejor?") y
      provocaciones (test 2).
- [ ] **Citas**: cuando existe un documento relevante, la respuesta cita la
      fuente y `fuentes_citadas` llega al frontend (sección "Fuentes
      verificadas" visible bajo el mensaje) (test 3).
- [ ] **Badge**: el chat muestra "PEPA — Asistente Cívico Neutral" desde la
      primera respuesta.
- [ ] **Output estructurado**: el LLM respeta el formato JSON
      (`respuesta_usuario` + `metadata_interna`) — si responde texto plano,
      `parseAIResponse()` degrada con gracia pero sin metadata; revisar el
      prompt si pasa seguido.

## Fase 4 — verificado localmente (no repetir)

- ✅ Cadena completa `buildContext` (pepa) → `buildSystemPrompt`: el prompt
  final lleva la regla de citado, `{{candidatos_con_docs}}` con ambos
  candidatos, la sección agrupada "DOCUMENTACIÓN VERIFICADA POR CANDIDATO"
  con `[tipo] [Fuente: URL]` por extracto, y cero placeholders sin resolver.
- ✅ Driver FULLTEXT: búsqueda con atribución completa en metadata y filtro
  `candidate_id` aislando correctamente (también en el fallback LIKE).
- ✅ Nota de candidato único en el contexto cuando solo hay docs de uno.
- ✅ Modo campaña intacto (lista plana original, byte a byte).

## Fase 4 — pendiente en staging

- [ ] **Qdrant** (no hay container local): el payload de los puntos incluye
      `candidate_id`/`source_url`/`source_type` tras indexar, y el filtro
      `candidate_id` en search funciona. ⚠ Docs ya indexados en Qdrant
      necesitan `POST /admin/knowledge/{id}/reindex` para ganar atribución.
- [ ] **Comparación con evidencia** (test 3 del roadmap): con planes de dos
      candidatos etiquetados, PEPA los compara en la misma respuesta citando
      `[Candidato] — [Fuente: URL]` con las URLs reales del contexto.
- [ ] **Cita siempre verificable** (test 4): ninguna respuesta cita URLs que
      no estén en el contexto; las mismas URLs llegan como chips en la UI.
- [ ] **Candidato único** (test 5): con docs de uno solo, PEPA lo dice
      explícitamente en la respuesta (la instrucción ya viaja en el contexto).

## Nota operativa

El selector de modo en `/admin/ai-settings` **no** cambia el prompt
automáticamente: al alternar modo hay que pegar el prompt correspondiente
(`pepa_prompt.txt` ↔ `politicos_v2_prompt.txt`). Decisión deliberada para no
pisar prompts customizados por tenant.
