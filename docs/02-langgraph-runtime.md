# 02 — Runtime LangGraph

## Problema y funcionamiento

Este runtime mostrará el loop sin reimplementarlo fuera de LangGraph. Un `StateGraph` conectará `call-model`, `execute-tools`, `delegate-agent` y `finalize`; routers puros elegirán el siguiente edge. El grafo se compilará con un checkpointer inyectado.

Los reintentos pertenecerán al nodo que conoce el tipo de error. `maxSteps` será un guard de estado antes de volver al modelo. HITL usará interrupciones dinámicas, porque conservan estado y permiten resume con el mismo `thread_id`.

## Decisiones y trade-offs

Se elige Graph API sobre Functional API por visualización, reducers y control explícito. Es más verbosa, pero esa verbosidad es parte del material de estudio. No se envolverá `StateGraph` en un builder genérico que esconda nodos y edges.

## Ubicación y lectura

Planeado: `src/graph/state.ts`, `src/graph/create-agent-graph.ts`, `src/graph/nodes/` y `src/runtime/langgraph-runtime.ts`. Leer primero state, después nodes, routers y compile.

## Ejercicios

1. Dibujar el edge elegido para una respuesta con dos tool calls.
2. Provocar `maxSteps` con un fake model.
3. Inspeccionar el historial de checkpoints entre nodos.
