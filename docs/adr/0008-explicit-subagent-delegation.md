# ADR 0008 — Delegación explícita de subagentes

- Estado: accepted
- Fecha: 2026-09-12

## Contexto

MiniAgents necesita enseñar el patrón supervisor/subagents sin ocultar autorización, contexto, lineage o profundidad dentro de un harness. LangChain documenta el patrón de subagentes como tools: el supervisor decide qué especialista invocar y recibe solo su resultado. LangGraph recomienda invocar un subgraph desde un nodo cuando padre e hijo tienen estados distintos y se necesita transformar explícitamente input y output.

El proyecto ya cuenta con definiciones serializables, runtimes intercambiables y un StateGraph propio. El child debe seguir siendo un agente completo con run y tools propios, no una función incrustada en la definición del padre.

## Decisión

Se implementan `SubagentRegistry` y `SubagentCoordinator` como servicios project-owned. `AgentDefinition.subagents` es la allowlist del padre. `LangGraphRuntime` expone al modelo una tool sintética única, `delegate_agent`, y la ejecuta mediante el nodo `delegate-agent`, no mediante `ToolRegistry`.

Cada llamada contiene un nombre y una tarea validados con Zod. Solo se permite una delegación por mensaje y se ejecuta síncronamente. El coordinator comprueba allowlist, registro y el menor límite entre la profundidad heredada y la política local. El child recibe un contexto aislado, crea su propio `runId` y devuelve un `ChildRunRecord`; el padre lo persiste en un reducer y recibe una representación serializada como `ToolMessage`.

El estado persistible pasa de versión 2 a 3 con `parentRunId`, `delegationDepth`, `delegationMaxDepth` y `childRuns`. `AgentRunRequest.lineage` propaga el presupuesto sin mezclarlo con metadata arbitraria. Los runtimes que no implementan delegación rechazan definiciones con subagentes.

## Consecuencias

Las tools y el historial del padre no se heredan. Un ciclo no puede reiniciar el límite cambiando de definición. El registry es explícito y puede ensamblarse incrementalmente en el composition root, lo que permite relaciones anidadas sin estado global.

La ejecución secuencial aumenta latencia, pero evita inventar semántica de fan-out, cancelación y fallos parciales. Los errores previos o durante el child vuelven al supervisor como errores recuperables; si un runtime falla antes de devolver outcome, no existe todavía un `childRunId` observable para almacenar. Un child interrumpido puede representarse, pero su resume coordinado queda fuera de este slice.

## Referencias verificadas

- [LangChain subagents](https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents)
- [LangChain multi-agent patterns](https://docs.langchain.com/oss/javascript/langchain/multi-agent)
- [LangGraph subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)
