# Hoja de ruta incremental

Cada etapa es un slice verificable; no se implementarán capas aisladas que no puedan probarse.

1. **Fundación** — configuración, CI, contratos serializables, documentación y decisiones. Estado: completado.
2. **Summarizer vertical** — fake model, provider port, structured output, runtime mínimo y ejemplo sin red. Estado: completado.
3. **Tools + researcher** — registry, autorización, mock search, calculator, clock y filesystem sandboxed. Estado: completado.
4. **LangGraph explícito** — estado, nodos, routers, max steps, retries y errores. Estado: completado.
5. **Checkpoints + HITL** — MemorySaver, sesión, interrupt y resume; backend durable diferido hasta contar con requisitos concretos. Estado: completado.
6. **Subagentes** — coordinator, child runs, resultados estructurados y profundidad. Estado: completado.
7. **Observabilidad** — Noop/Console/Langfuse v5 con OpenTelemetry y prompt metadata. Estado: completado.
8. **Evaluaciones** — determinísticas, judge con fake, datasets y gate de regresión. Estado: completado.
9. **Deep Agents** — adapter comparativo y dataset ejecutado contra ambos runtimes. Estado: completado.
10. **API HTTP** — run, resume, run lookup y session lookup. Estado: completado.
11. **Endurecimiento** — fallos, timeouts, migraciones, cobertura, ejemplos y revisión documental completa. Estado: completado.

Los catorce capítulos reflejan el código real de cada etapa. La CI debe permanecer verde al final de cada slice.
