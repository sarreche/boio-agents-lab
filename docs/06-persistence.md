# 06 — Persistencia

## Problema y funcionamiento

Los checkpoints guardan snapshots del grafo por super-step y permiten resume, HITL y recuperación. Las sesiones y metadata de runs resuelven consultas de aplicación que no deberían inferirse recorriendo checkpoints.

La primera implementación usará `MemorySaver` para aprender el protocolo sin agregar infraestructura externa. `sessionId` se mapeará al `thread_id` de LangGraph; `runId` seguirá siendo una ejecución observable separada.

El backend durable queda deliberadamente sin elegir. Se incorporará cuando existan requisitos concretos de despliegue, volumen, retención, concurrencia, costo y operación. El puerto y los tests de contrato permitirán evaluar opciones sin acoplar el grafo.

## Decisiones y trade-offs

No se escribirá un motor de checkpoints propio. La persistencia en memoria no sobrevive reinicios y no sirve para varias instancias; esa limitación es intencional en esta etapa. Aun así, los nodos deben diseñarse como idempotentes porque un resume puede volver a ejecutar trabajo.

## Ubicación y lectura

Planeado: `src/persistence/checkpointer.ts`, `memory-checkpointer.ts` y contratos de sesión. El adapter durable se nombrará solo después de elegir una tecnología.

## Ejercicios

1. Reanudar con el mismo session ID.
2. Contrastar checkpoint, session y run.
3. Simular fallo después de una tool con side effect.
