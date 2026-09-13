# 06 — Persistencia

## Problema y funcionamiento

Los checkpoints guardan snapshots del grafo por super-step y permiten resume, HITL y recuperación. Las sesiones y metadata de runs resuelven consultas de aplicación que no deberían inferirse recorriendo checkpoints.

La implementación usa un `MemorySaver` privado por instancia de `LangGraphRuntime`, o un `BaseCheckpointSaver` inyectado. `sessionId` se mapea exactamente al `thread_id` de LangGraph; `runId` sigue identificando la ejecución y se conserva antes y después de una pausa.

Una definición con `approvalRequiredTools` exige `sessionId`. La primera llamada crea el checkpoint y puede devolver `status: "interrupted"`. `resume({ sessionId, value })` carga el mismo thread y envía un `Command({ resume: value })`. El resultado común es una unión discriminada: el caller debe comprobar `status` antes de leer `output` o `interrupts`.

El ciclo de vida es deliberadamente estricto en este slice:

- un `sessionId` nuevo inicia un único workflow;
- un checkpoint existente debe reanudarse, no reiniciarse con `run()`;
- solo un workflow actualmente interrumpido acepta `resume()`;
- otra definición de agente no puede apropiarse de la sesión.

El backend durable queda deliberadamente sin elegir. Se incorporará cuando existan requisitos concretos de despliegue, volumen, retención, concurrencia, costo y operación. El boundary de migración ya está implementado: `migratePersistedAgentState()` acepta versiones 1, 2 o 3, ejecuta upgrades secuenciales y valida el estado v3 antes de restaurarlo.

## Decisiones y trade-offs

No se escribe un motor de checkpoints propio. La persistencia en memoria no sobrevive reinicios, no se comparte entre procesos y crece mientras viva el runtime; esa limitación es intencional. El objeto `LangGraphRuntime` debe permanecer vivo entre `run` y `resume`. Los nodos deben ser idempotentes porque LangGraph vuelve a ejecutar desde el comienzo del nodo que llamó `interrupt()`.

La migración v1 exige que el operador aporte `v1StartedAt`, porque esa versión no persistía el inicio. La migración v2 agrega defaults conservadores de delegación sin inventar children. Versiones futuras se rechazan para evitar leer datos con semántica desconocida. Un adapter durable será responsable de migrar antes de restaurar y de escribir solamente la versión actual.

## Ubicación y lectura

Leer `src/runtime/langgraph-runtime.ts` para el mapeo y las guardas de sesión; `src/persistence/agent-state-migrations.ts` para compatibilidad de estado; `src/core/agent-runtime.ts` para `AgentRunOutcome`; y los tests de HITL/migración para el contrato observable. El adapter durable se nombrará solo después de elegir una tecnología.

## Ejercicios

1. Reanudar con el mismo session ID.
2. Contrastar checkpoint, session y run.
3. Simular fallo después de una tool con side effect.

## Referencias verificadas

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
