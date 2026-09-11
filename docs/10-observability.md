# 10 — Observabilidad

## Problema y funcionamiento

Una ejecución agentic alterna decisiones, modelos, tools y subagentes; un log final no explica su comportamiento. El proyecto definirá un `Tracer` propio con runs/spans y adapters `NoopTracer`, `ConsoleTracer` y `LangfuseTracer`.

Langfuse se integrará con SDK TypeScript v5 sobre OpenTelemetry. Model calls serán observations de tipo generation, tools de tipo tool, agentes de tipo agent y evaluadores de tipo evaluator. Prompt name/version, provider, modelo, temperatura, tokens, latencia, errores, sesión y jerarquía se registrarán cuando estén disponibles.

## Decisiones y trade-offs

La aplicación debe funcionar sin Langfuse. La captura de inputs/outputs será configurable y redactable: máxima visibilidad no justifica filtrar secrets o datos sensibles.

## Ubicación y lectura

Planeado: `src/observability/tracer.ts`, `noop-tracer.ts`, `console-tracer.ts`, `langfuse-tracer.ts` y setup OTEL en el composition root.

## Ejercicios

1. Ejecutar el mismo fake run con los tres adapters.
2. Deshabilitar captura de payloads y conservar métricas.
3. Correlacionar parent run y child run.
