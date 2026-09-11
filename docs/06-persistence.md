# 06 — Persistencia

## Problema y funcionamiento

Los checkpoints guardan snapshots del grafo por super-step y permiten resume, HITL y recuperación. Las sesiones y metadata de runs resuelven consultas de aplicación que no deberían inferirse recorriendo checkpoints.

Habrá `MemoryCheckpointer` para tests y un adapter PostgreSQL para durabilidad. `sessionId` se mapeará al `thread_id` de LangGraph; `runId` seguirá siendo una ejecución observable separada. Las migraciones versionarán tablas propias y cualquier estado adicional.

## Decisiones y trade-offs

No se escribirá un motor de checkpoints propio si el paquete oficial PostgreSQL cumple el contrato. Sí habrá un `SessionStore` propio para metadata del dominio. Durabilidad implica diseñar nodos idempotentes porque un resume puede volver a ejecutar trabajo.

## Ubicación y lectura

Planeado: `src/persistence/checkpointer.ts`, `memory-checkpointer.ts`, `postgres-checkpointer.ts`, `session-store.ts` y migraciones.

## Ejercicios

1. Reanudar con el mismo session ID.
2. Contrastar checkpoint, session y run.
3. Simular fallo después de una tool con side effect.
