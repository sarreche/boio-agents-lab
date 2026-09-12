# ADR 0005 — Runtime con StateGraph explícito

- Estado: accepted
- Fecha: 2026-09-11

## Contexto

`ToolCallingRuntime` demuestra un agente funcional mediante `createAgent`, pero el harness oculta el estado, los nodos y el routing que este laboratorio busca enseñar. El runtime explícito debe conservar el mismo contrato público y reutilizar el boundary de tools sin escribir un loop imperativo fuera de LangGraph.

## Decisión

`LangGraphRuntime` compila un `StateGraph` propio con `StateSchema`, `MessagesValue` y `ReducedValue`. El grafo contiene nodos nombrados para modelo, tools, finalización y errores; routers puros deciden los conditional edges. Structured output se solicita mediante una tool terminal reservada y se valida dentro de `finalize` y nuevamente en el adapter.

`maxSteps` cuenta model calls exitosas y se comprueba antes de regresar al modelo. `call-model` usa `retryPolicy` acotada; los errores de tools se serializan y se devuelven al modelo como `ToolMessage` recuperable. El estado comienza en versión `1`.

## Consecuencias

El control flow puede inspeccionarse y probarse sin depender de detalles internos de `createAgent`. Hay más código que en el harness, pero cada responsabilidad queda localizable. La tool terminal reserva un nombre derivado del agente y no puede coexistir con una tool regular del mismo nombre.

Este slice compila sin checkpointer. `sessionId` y `schemaVersion` preparan el boundary, pero `thread_id`, persistencia, interrupt y resume pertenecen al punto 5. La retry policy predeterminada de LangGraph aún necesita una taxonomía de errores específica por provider antes de producción.

## Referencias verificadas

- [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api)
- [LangGraph state and reducers](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
