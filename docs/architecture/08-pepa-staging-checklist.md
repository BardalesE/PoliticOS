# 08 — Checklist de staging: Fase 3 (PEPA como modo estable)

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

## Nota operativa

El selector de modo en `/admin/ai-settings` **no** cambia el prompt
automáticamente: al alternar modo hay que pegar el prompt correspondiente
(`pepa_prompt.txt` ↔ `politicos_v2_prompt.txt`). Decisión deliberada para no
pisar prompts customizados por tenant.
