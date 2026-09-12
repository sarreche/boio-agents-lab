# 03 — Estado del agente

## Problema

El estado conecta pasos que pueden repetirse, persistirse o reanudarse. Si las colecciones se sobrescriben accidentalmente, se pierde historia; si cada nodo devuelve el objeto completo, aparecen mutaciones y acoplamiento. El schema debe expresar qué valores se acumulan y cuáles se reemplazan.

## Forma implementada

`AgentGraphState` usa `StateSchema`. `MessagesValue` aplica el reducer oficial de mensajes. `ReducedValue` acumula pasos, tool calls, tool results y errores. Los demás campos usan last-write-wins.

| Campo               | Semántica     | Propósito                                                        |
| ------------------- | ------------- | ---------------------------------------------------------------- |
| `schemaVersion`     | reemplazo     | Versión del estado persistible; actualmente `2`.                 |
| `agentName`         | reemplazo     | Identidad declarativa del agente.                                |
| `runId`             | reemplazo     | Identidad de esta ejecución; se conserva al reanudar.            |
| `startedAt`         | reemplazo     | Inicio original del run; no cambia durante resume.               |
| `sessionId`         | reemplazo     | Continuidad y clave de checkpoint cuando se solicita aprobación. |
| `promptVersion`     | reemplazo     | Trazabilidad del prompt activo.                                  |
| `messages`          | reducer       | Historial con semántica de IDs de LangGraph.                     |
| `stepCount`         | suma          | Model calls exitosas.                                            |
| `toolCalls`         | concatenación | Auditoría de intentos de tools, incluso rechazados.              |
| `toolResults`       | concatenación | Resultado `success`, `error` o `rejected`.                       |
| `errors`            | concatenación | Error seguro, serializado y asociado al nodo/paso.               |
| `approvalDecisions` | concatenación | Decisión, actor, razón, timestamp y tool call IDs.               |
| `status`            | reemplazo     | `running`, `completed` o `failed`.                               |
| `failureReason`     | reemplazo     | Razón pública del final fallido.                                 |
| `finalOutput`       | reemplazo     | Candidato a output, revalidado por el runtime.                   |

Los nodos reciben el snapshot actual y retornan solamente un `AgentGraphStateUpdate`. `serializeAgentError` retiene nombre, mensaje, nodo, retryability y paso, pero no persiste objetos `Error`, stack traces ni payloads sensibles.

## Identidades

- `sessionId`: continuidad lógica entre la invocación inicial y sus resumes.
- `runId`: intento individual; nunca se reutiliza como sesión.
- `thread_id`: el adapter lo mapea exactamente a `sessionId`; si no hay sesión usa `runId` para ejecuciones no reanudables.

## Decisiones y trade-offs

- La versión `2` agrega `startedAt`, auditoría de aprobación y el resultado `rejected`. La ADR 0007 registra el cambio antes de usar almacenamiento durable.
- `toolResults.content` es texto JSON, no un objeto arbitrario, para mantener el audit trail serializable.
- Los errores de tools quedan en state y también se convierten en `ToolMessage`; esto permite recuperación y conserva evidencia.
- Los mensajes son instancias LangChain administradas por `MessagesValue`; el serializer/checkpointer de LangGraph será responsable de su representación durable.
- Guardar tool arguments ayuda a estudiar y auditar, pero requerirá redacción configurable antes de usar datos sensibles.

## Dónde leer

Leer `src/graph/state.ts`, luego `src/graph/nodes/`, `src/graph/routers.ts` y `tests/graph/routers.test.ts`.

## Ejercicios

1. Clasificar un nuevo campo como reducer o last-write-wins antes de implementarlo.
2. Ejecutar una tool fallida y observar `messages`, `toolCalls`, `toolResults` y `errors`.
3. Explicar por qué `stepCount` se incrementa en `call-model` y no en el router.
4. Diseñar una migración hipotética de `schemaVersion: 2` a `3`.
