# ADR 0004 — Boundary de tools y runtime inicial de Researcher

- Estado: accepted
- Fecha: 2026-09-11

## Contexto

Researcher debe decidir si investiga y ejecutar únicamente tools autorizadas. El StateGraph explícito pertenece al siguiente slice; implementar mientras tanto un loop manual duplicaría primitivas existentes y dejaría una arquitectura transitoria engañosa.

## Decisión

Las tools se definen mediante un contrato propio con schemas Zod de entrada/salida, executor con `AbortSignal` y adapter a `ClientTool`. `ToolRegistry` aplica allowlist y timeout. Los built-ins no incluyen shell y el filesystem queda confinado a un root.

`ToolCallingRuntime` usa `createAgent` de LangChain, que ya se apoya en LangGraph, junto con middleware oficial de límites de model calls y tool calls. Structured output se representa como una tool terminal con nombre estable. `AgentRunResult.toolCalls` registra solo tools del agente y excluye esa tool interna de formato.

## Consecuencias

Researcher puede buscar o finalizar sin mantener un loop propio. El runtime actual es funcional, pero oculta el grafo construido por LangChain; el punto 4 implementará la variante explícita sobre el mismo `ToolRegistry` y permitirá compararlas. Los timeouts abortan cooperativamente y el filesystem documenta su límite TOCTOU frente a procesos locales hostiles.
