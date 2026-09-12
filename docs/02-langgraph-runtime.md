# 02 — Runtime LangGraph

## Problema y funcionamiento

Este runtime mostrará el loop sin reimplementarlo fuera de LangGraph. Un `StateGraph` conectará `call-model`, `execute-tools`, `delegate-agent` y `finalize`; routers puros elegirán el siguiente edge. El grafo se compilará con un checkpointer inyectado.

Los reintentos pertenecerán al nodo que conoce el tipo de error. `maxSteps` será un guard de estado antes de volver al modelo. HITL usará interrupciones dinámicas, porque conservan estado y permiten resume con el mismo `thread_id`.

## Precursor implementado

`src/runtime/direct-model-runtime.ts` implementa hoy el mismo `AgentRuntime`, pero realiza una única llamada estructurada. Permite verificar provider resolution, mensajes, metadata, IDs y output Zod antes de agregar el grafo. No tiene nodos, edges, checkpoints ni tool loop; esas ausencias son intencionales y explícitas.

`src/runtime/tool-calling-runtime.ts` añade decisiones y tools mediante `createAgent` de LangChain. Ese harness ya corre sobre LangGraph y aplica middleware oficial para límites de model/tool calls. Sirve como implementación funcional de referencia; el próximo runtime expondrá el `StateGraph` en vez de delegar su construcción al harness.

## Decisiones y trade-offs

Se elige Graph API sobre Functional API por visualización, reducers y control explícito. Es más verbosa, pero esa verbosidad es parte del material de estudio. No se envolverá `StateGraph` en un builder genérico que esconda nodos y edges.

## Ubicación y lectura

Actual: `src/core/agent-runtime.ts`, `src/runtime/direct-model-runtime.ts` y `src/runtime/tool-calling-runtime.ts`. Planeado: `src/graph/state.ts`, `src/graph/create-agent-graph.ts`, `src/graph/nodes/` y `src/runtime/langgraph-runtime.ts`. Leer primero el contrato, luego ambos precursores; después state, nodes, routers y compile.

## Ejercicios

1. Dibujar el edge elegido para una respuesta con dos tool calls.
2. Provocar `maxSteps` con un fake model.
3. Inspeccionar el historial de checkpoints entre nodos.
