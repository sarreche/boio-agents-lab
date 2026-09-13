# ADR 0010 — Contrato versionado de evals y gate de regresión

- Estado: accepted
- Fecha: 2026-09-12

## Contexto

MiniAgents necesita medir comportamiento más allá de los tests y usar esos resultados en CI. El contrato debe distinguir una respuesta de baja calidad de una evaluación que no pudo ejecutarse, admitir métricas aún no normalizadas por todos los providers y permanecer offline por defecto.

## Decisión

Los datasets son valores TypeScript validados, con nombre, versión y case IDs únicos. `runEvaluation()` ejecuta secuencialmente un `StructuredAgent`, aplica evaluadores independientes y devuelve resultados `passed`, `failed` o `error` más métricas y agregados.

Los scores se normalizan a 0..1. Token usage y costo son opcionales y entran por un extractor explícito. Un error de ejecución o evaluator se registra como error, no como score de calidad. El LLM judge depende del puerto `JudgeModel` y valida su rúbrica con Zod.

El gate compara thresholds mediante `assertRegressionThresholds()` y lanza `RegressionThresholdError` ante violaciones; el test runner convierte esa excepción en salida no cero. Los baselines de CI usan fakes y datasets locales, sin red ni credenciales.

## Consecuencias

Los resultados son reproducibles y las regresiones bloquean CI de forma visible. La ejecución secuencial es más lenta que el fan-out, y los reportes no inventan tokens/costos cuando el provider no los expone de forma normalizada. Las suites reales deberán ser opt-in y declarar presupuesto.
