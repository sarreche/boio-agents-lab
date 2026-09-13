# ADR 0009 — Puerto de trazas y Langfuse v5

- Estado: accepted
- Fecha: 2026-09-12

## Contexto

El runtime necesita correlacionar agentes, generaciones, tools y children sin importar infraestructura en `core` ni depender de un servicio externo. La captura indiscriminada de inputs/outputs también contradice el límite de seguridad del proyecto. Se verificó la API oficial actual de Langfuse v5 antes de implementar.

## Decisión

Se adopta un `Tracer` propio basado en callback y adapters `NoopTracer`, `ConsoleTracer` y `LangfuseTracer`. El callback mantiene el contexto OpenTelemetry activo y hace que el anidamiento de código coincida con el de las observaciones.

Langfuse usa `startActiveObservation()` y tipos `agent`, `generation`, `tool`, `evaluator` y `span`. La exportación se configura mediante `LangfuseSpanProcessor` dentro de `NodeSDK`; el lifecycle no comienza al importar módulos y debe iniciarse/cerrarse en el composition root.

Inputs y outputs no se capturan por defecto. Cuando se habilitan, pasan por un redactor configurable y por la máscara del processor. Las fallas de observabilidad son best-effort: no pueden repetir, cancelar ni sustituir el resultado de una operación de dominio.

## Consecuencias

El proyecto puede ejecutar y probar todos sus runtimes sin red ni credenciales. Hay código adapter adicional y una traza puede perderse si falla el exporter. El harness `createAgent` se instrumenta en su frontera y en tools propias; sus model calls internas no se representan falsamente como una sola generación.

## Referencias oficiales verificadas

- [Langfuse — Observation types](https://langfuse.com/docs/observability/features/observation-types)
- [Langfuse — Instrumentation](https://langfuse.com/docs/observability/sdk/instrumentation)
- [Langfuse — TypeScript SDK v5 upgrade](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5)
- [Langfuse — Metadata](https://langfuse.com/docs/observability/features/metadata)
