# ADR 0002 — Baseline de dependencias agentic

- Estado: accepted
- Fecha: 2026-09-11

## Contexto

La especificación exige verificar APIs actuales antes de implementar. Se consultaron documentación oficial y el registro npm el 2026-09-11.

## Decisión

Se fijan versiones exactas en `package.json`. La línea base incluye LangChain 1.5, LangGraph 1.4, Deep Agents 1.13 y Langfuse SDK 5.11. TypeScript queda en 6.0.3, la versión más reciente dentro del rango soportado por `typescript-eslint` 8.70; no se fuerza TypeScript 7 ignorando peer dependencies. Langfuse se integrará mediante `@langfuse/tracing`, `@langfuse/otel` y `@langfuse/client`, no mediante las APIs antiguas `trace()/span()/generation()`.

El runtime explícito utilizará Graph API porque hace visibles estado y routing. `thread_id` se mapeará conscientemente a continuidad de sesión. HITL usará `interrupt()` y `Command({ resume })` con checkpointer.

## Consecuencias

Los upgrades de majors o cambios de checkpoint requieren nueva ADR y tests de compatibilidad. Deep Agents se tratará como harness sobre LangGraph; su adapter no prometerá equivalencia interna con el runtime explícito.

## Referencias

- Documentación oficial de LangGraph: quickstart, persistence, interrupts y subgraphs.
- Documentación oficial de Deep Agents JavaScript: overview y quickstart.
- Documentación oficial de Langfuse SDK TypeScript v5 y migraciones v3→v4→v5.
- Metadatos de versiones publicados por npm.
