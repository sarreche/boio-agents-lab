# 10 — Observabilidad

## Problema

Una respuesta final no permite explicar por qué un agente eligió un modelo, llamó una tool o delegó. A la vez, enviar prompts completos a un tercero puede filtrar credenciales o datos personales. MiniAgents necesita trazas útiles sin acoplar su dominio a Langfuse ni volver obligatoria una conexión externa.

## Funcionamiento implementado

`Tracer.observe()` recibe una especificación y un callback. El callback conserva el contexto activo de OpenTelemetry para que las observaciones anidadas formen una jerarquía real.

| Operación                        | Tipo         | Metadata principal                                      |
| -------------------------------- | ------------ | ------------------------------------------------------- |
| Run o resume de agente           | `agent`      | agent, run, session, prompt version, provider, parent   |
| Llamada explícita al modelo      | `generation` | model, temperature, step, prompt version                |
| Ejecución autorizada de una tool | `tool`       | tool, run, session, timeout                             |
| Delegación                       | `span`       | parent run, child agent y child run al finalizar        |
| Evaluadores del próximo slice    | `evaluator`  | soportado por el contrato; instrumentación aún diferida |

`DirectModelRuntime` y `LangGraphRuntime` exponen cada llamada propia al modelo como `generation`. `ToolCallingRuntime` traza el agente y las tools que atraviesan el registry, pero su harness `createAgent` oculta el límite exacto de cada model call; no se etiqueta todo el loop como una generación ficticia.

Un resume abre una nueva observación `agent.*.resume` con el mismo `runId`: no mantiene un span abierto durante una pausa humana potencialmente larga. Un child configurado con el mismo tracer crea su propia observación dentro del contexto de delegación y conserva `parentRunId`/`childRunId` como metadata de dominio.

## Adaptadores y lifecycle

- `NoopTracer` ejecuta el callback sin efectos externos.
- `ConsoleTracer` emite eventos estructurados `start`, `end` y `error`; acepta clock y writer inyectables.
- `LangfuseTracer` traduce el puerto a `startActiveObservation()` del SDK v5.
- `createObservability()` valida configuración, construye `LangfuseSpanProcessor` + `NodeSDK` y expone `start`, `flush` y `shutdown`.

La caída del writer, del contexto o del exporter es best-effort: nunca repite una operación que pudo tener efectos ni reemplaza su error original. `shutdown()` debe llamarse en el cierre ordenado del proceso para vaciar batches.

## Privacidad

`LANGFUSE_CAPTURE_INPUT` y `LANGFUSE_CAPTURE_OUTPUT` son `false` por defecto. Aun activadas, la redacción recursiva enmascara claves comunes como `password`, `authorization`, `apiKey`, `secret`, `token` y `credential`; el processor aplica la misma máscara antes de exportar. No se copia metadata arbitraria del request a las observaciones propias.

## Ubicación y lectura sugerida

1. `src/observability/tracer.ts`: contrato, política de captura y redactor.
2. `noop-tracer.ts` y `console-tracer.ts`: semántica mínima observable.
3. `langfuse-tracer.ts`: frontera del SDK v5 y protección de la operación.
4. `setup.ts`: composition/lifecycle OpenTelemetry.
5. `src/runtime/`, `src/graph/nodes/` y `src/tools/registry.ts`: puntos instrumentados.
6. `tests/observability/`: privacidad, fallos y garantía de ejecución única.

## Decisiones y trade-offs

El contrato propio evita imports de Langfuse en `core`, runtimes o tools. La observabilidad es best-effort; puede perderse una traza durante una caída, pero el trabajo conserva su semántica. Los payloads desactivados reducen detalle de debugging a cambio de un límite seguro. Tokens y costos se registrarán cuando el adapter de modelo normalice usage metadata; inventar ceros sería peor que dejar el dato ausente.

## Ejercicios

1. Ejecutar un fake run con `NoopTracer` y `ConsoleTracer`, comparando el resultado.
2. Activar captura con un payload que contenga `apiKey` y verificar la máscara.
3. Dibujar la jerarquía agent → generation → tool → delegation → child agent.
4. Simular un writer que lanza una excepción y comprobar que la tool se ejecuta una sola vez.
