# ADR 0011 — Deep Agents detrás de una frontera deny-by-default

- Estado: accepted
- Fecha: 2026-09-13

## Contexto

El slice comparativo debe ejecutar una `AgentDefinition` mediante `deepagents` sin conceder las tools implícitas del harness. `createDeepAgent()` instala middleware de filesystem, planificación y subagentes; además, los profiles dependen de cómo el modelo reporta provider y nombre. Confiar sólo en prompts o en el profile no preserva la allowlist del proyecto para todos los adapters de modelo.

## Decisión

`DeepAgentsRuntime` implementa el puerto común y usa `createDeepAgent()` con el modelo del registry, las tools autorizadas del `ToolRegistry`, el prompt y el schema Zod. Usa `StateBackend`, permisos deny sobre filesystem y límites de llamadas a modelo/tools.

Todas las tools implícitas conocidas se excluyen mediante un harness profile y, como garantía independiente, un middleware del proyecto las elimina antes de cada model call y rechaza cualquier intento de ejecución. El subagente general-purpose queda desactivado. HITL y subagentes declarados fallan temprano hasta que un adapter pueda conservar la semántica MiniAgents de checkpoint, approval, lineage y child-run records.

La respuesta estructurada se revalida en el límite del runtime y se normaliza como `runtime: "deep-agents"`. El dataset Researcher se ejecuta contra éste y contra `LangGraphRuntime` con los mismos evaluadores determinísticos.

## Consecuencias

La misma definición conserva sus permisos en ambos runtimes y los tests siguen siendo offline. Se pueden comparar resultados observables sin fingir equivalencia interna. A cambio, este primer adapter usa sólo una parte del valor del harness: planificación, filesystem, persistencia, HITL y delegación requieren decisiones explícitas futuras.

El listado de tools implícitas depende de la versión fijada de `deepagents`; una actualización debe revisar este guard y sus pruebas. El registro de profiles es global en el proceso, mientras el middleware constituye la frontera efectiva por invocación.

## Referencias verificadas

- Deep Agents overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Customization and harness profiles: https://docs.langchain.com/oss/javascript/deepagents/customization
- Backends and filesystem behavior: https://docs.langchain.com/oss/javascript/deepagents/backends
- Subagents: https://docs.langchain.com/oss/javascript/deepagents/subagents
- LangChain structured output: https://docs.langchain.com/oss/javascript/langchain/structured-output
- API instalada inspeccionada: `deepagents@1.13.4`.
