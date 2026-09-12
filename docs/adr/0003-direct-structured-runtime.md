# ADR 0003 — Runtime directo como primer slice

- Estado: accepted
- Fecha: 2026-09-11

## Contexto

El primer agente funcional necesita demostrar definición, provider injection y structured output. Introducir a la vez el loop completo de LangGraph dificultaría aislar qué responsabilidad pertenece a cada boundary.

## Decisión

Se crea el puerto `AgentRuntime` y una implementación `DirectModelRuntime` que realiza una sola llamada mediante `BaseChatModel.withStructuredOutput()`. El resultado se valida nuevamente con Zod antes de construir `AgentRunResult`. `Summarizer` se monta sobre este contrato y se prueba con el fake model oficial de LangChain.

El nombre `direct-model` aparece en cada resultado para que no pueda confundirse con LangGraph. No tendrá tools, retries, checkpoints ni loops; esas capacidades pertenecen a los siguientes runtimes/slices.

## Consecuencias

Existe un recorrido vertical ejecutable temprano y sin credenciales. LangGraphRuntime y DeepAgentsRuntime podrán implementar el mismo puerto. El contrato puede evolucionar al introducir interrupciones y streaming; cualquier cambio incompatible requerirá actualizar tests, ejemplo y esta decisión mediante una ADR posterior.
