# ADR 0013 — Deadlines, migraciones y cobertura como gates de producción

- Estado: accepted
- Fecha: 2026-09-13

## Contexto

El último slice debe convertir garantías declaradas en controles ejecutables. Las tools ya tenían timeout, pero `AGENT_MODEL_TIMEOUT_MS` no estaba conectado y una ejecución completa podía quedar pendiente. El estado persistible llegó a versión 3 sin una función probada para actualizar snapshots anteriores. La cobertura exigía 80 %, aunque CI ejecutaba tests sin cobertura y el gate fallaba localmente en branches.

## Decisión

`executeWithDeadline()` aplica un límite de pared, aborta cooperativamente la operación y rechaza aunque el proveedor ignore la señal. Todos los runtimes reciben `runTimeoutMs`; `LangGraphRuntime` recibe además `modelTimeoutMs` para cada nodo de modelo. Las tools conservan su timeout independiente. Los defaults son 300 segundos por run, 60 segundos por model call y 30 segundos por tool.

`migratePersistedAgentState()` implementa la cadena `v1 → v2 → v3`, valida cada resultado contra el schema persistido actual y rechaza versiones futuras. Un adapter durable deberá ejecutarla antes de entregar state restaurado al grafo. El timestamp ausente en v1 se aporta explícitamente desde metadata de migración; no se inventa silenciosamente.

CI ejecuta `npm run test:coverage` y mantiene umbrales globales de 80 % para statements, branches, functions y lines. Los tests cubren fallos HTTP, deadlines, cancelación y migraciones.

## Consecuencias

El caller recupera control ante operaciones colgadas y recibe errores tipados. La señal reduce trabajo abandonado cuando el proveedor coopera; una dependencia que ignore abort puede continuar internamente, por lo que los efectos externos siguen necesitando idempotencia.

La migración queda lista detrás de un boundary sin elegir prematuramente una base durable. No migra el formato interno del checkpoint de un vendor: esa compatibilidad deberá verificarse al seleccionar el adapter.

El gate de cobertura aumenta la confianza en ramas de error, pero no sustituye evals ni pruebas de integración opt-in con proveedores.

## Referencias verificadas

- [LangChain custom middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)
- [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- API instalada inspeccionada: `langchain@1.5.11`, `@langchain/langgraph@1.4.14`.
