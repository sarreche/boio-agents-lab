# 09 — Deep Agents

## Problema

Deep Agents ofrece un harness con planificación, filesystem/context management y subagentes. El laboratorio necesita aprovecharlo sin fingir que su ejecución es idéntica al grafo explícito.

## Integración prevista

El paquete JavaScript `deepagents` expone `createDeepAgent()` y devuelve un grafo LangGraph compilado. `DeepAgentsRuntime` traducirá una `AgentDefinition` a esa configuración, inyectará únicamente las tools autorizadas, conectará el modelo resuelto por el registry y adaptará el resultado al contrato común.

No se activarán capacidades peligrosas implícitamente. En particular, una backend con ejecución de shell no formará parte del runtime predeterminado. El límite efectivo debe estar en tools y sandbox, no en una instrucción al modelo.

## Comparación

| Aspecto          | LangGraphRuntime                 | DeepAgentsRuntime                        |
| ---------------- | -------------------------------- | ---------------------------------------- |
| Loop             | Nodos y edges propios            | Harness configurado                      |
| Estado           | Esquema del proyecto             | Estado/capacidades del harness adaptadas |
| Planificación    | Se implementa explícitamente     | `write_todos` integrada                  |
| Subagentes       | Coordinator y child runs propios | Middleware/subagents del harness         |
| Valor de estudio | Máxima visibilidad               | Comparación de abstracciones             |

## Trade-offs

Un resultado común facilita consumidores y evaluaciones, pero una equivalencia interna forzada ocultaría diferencias valiosas. El adapter normalizará entradas, resultados, errores y tracing; no intentará reproducir cada checkpoint o evento uno a uno.

## Dónde mirar

Cuando se implemente: `src/runtime/deepagents-runtime.ts`, sus tests contractuales y el ejemplo `examples/deep-agent.ts`.

## Ejercicios

1. Comparar el número de componentes propios necesarios para un mismo caso.
2. Inspeccionar el grafo compilado retornado por `createDeepAgent`.
3. Ejecutar el mismo dataset contra ambos runtimes y analizar divergencias.
