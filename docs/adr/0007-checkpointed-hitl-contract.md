# ADR 0007 — Contrato checkpointed de human-in-the-loop

- Estado: accepted
- Fecha: 2026-09-12

## Contexto

El runtime explícito necesita pausar antes de efectos sensibles y continuar sin confundir continuidad conversacional con identidad de ejecución. También debe enseñar la semántica real de LangGraph: `interrupt()` persiste mediante un checkpointer y el nodo interrumpido vuelve a comenzar al reanudar.

No existen aún requisitos que justifiquen elegir una base durable. La ADR 0006 difirió correctamente esa decisión.

## Decisión

`LangGraphRuntime` usa `MemorySaver` por defecto y permite inyectar un `BaseCheckpointSaver`. `sessionId` se mapea exactamente a `thread_id`; `runId` y `startedAt` se conservan durante resume. El runtime común devuelve `AgentRunOutcome`, discriminado por `status: "completed" | "interrupted"`, y solo los runtimes con checkpointer implementan `resumeStructured`.

`AgentDefinition.approvalRequiredTools` debe ser un subconjunto de `tools`. Si una respuesta contiene al menos una tool protegida, el batch completo se interrumpe antes de ejecutar efectos. Una decisión Zod-validada aprueba o rechaza el batch. El rechazo produce mensajes de tool compatibles con el protocolo, pero nunca invoca la implementación.

Los runtimes sin soporte de checkpoints rechazan definiciones con `approvalRequiredTools`; no pueden ignorar una política de seguridad al ejecutar la misma definición.

El estado persistible pasa de versión 1 a 2 para agregar `startedAt`, `approvalDecisions` y el resultado de tool `rejected`. Cada decisión conserva actor, razón opcional, timestamp e IDs de llamadas.

## Consecuencias

La API obliga a estrechar `status` antes de acceder a output o interrupciones. Las sesiones tienen un ciclo de vida seguro: no se puede sobrescribir un checkpoint, reanudar una ejecución finalizada ni usar otra definición sobre el mismo thread.

`MemorySaver` requiere conservar la misma instancia de runtime, pierde datos al reiniciar y no sirve para despliegues distribuidos. La identidad declarada en `actor` todavía debe autenticarse en una capa de transporte futura. Elegir persistencia durable requerirá otra ADR y pruebas de compatibilidad con estado v2.

## Referencias verificadas

- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
