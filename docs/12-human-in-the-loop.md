# 12 — Human in the loop

## Problema y funcionamiento

Acciones de riesgo pueden requerir aprobación sin mantener un proceso vivo. Cada definición declara `approvalRequiredTools`, un subconjunto validado de su allowlist `tools`. Si el modelo solicita alguna tool protegida, `request-approval` llama `interrupt()` con agent, run, session y argumentos serializables. El caller recibe `status: "interrupted"`; ninguna tool del batch se ejecutó todavía.

Resume invoca el mismo thread con `Command({ resume: decision })`. La decisión se valida con Zod y contiene `decision: "approve" | "reject"`, `actor` y una `reason` opcional. Un input inválido vuelve a interrumpir con errores de validación. Aprobación dirige el batch a `execute-tools`; rechazo dirige a `reject-tools`, que genera `ToolMessage` válidos y registros `rejected` sin ejecutar efectos. El modelo puede entonces producir su respuesta final.

El nodo que contiene el interrupt empieza nuevamente al reanudar. Por eso el payload anterior a `interrupt()` es cálculo determinista, el timestamp se crea únicamente después de una decisión válida y la señal interna no se captura con `try/catch`.

## Decisiones y trade-offs

Se usan interrupciones dinámicas en vez de breakpoints estáticos. Una decisión cubre todas las tool calls del mismo mensaje: así no queda un batch parcialmente ejecutado. El audit trail incluye actor, decisión, razón, timestamp y IDs de las llamadas. En esta etapa el caller aporta la identidad del actor; autenticar y autorizar a ese actor pertenece al futuro transporte/API.

`DirectModelRuntime` y `ToolCallingRuntime` no pueden aplicar este protocolo y rechazan de forma explícita toda definición con tools protegidas. Así una política de aprobación nunca se degrada silenciosamente al cambiar de runtime.

## Ubicación y lectura

Leer en este orden: `src/core/agent-definition.ts`, `src/graph/routers.ts`, `src/graph/nodes/request-approval.ts`, `src/graph/nodes/reject-tools.ts`, `src/runtime/langgraph-runtime.ts`, `tests/runtime/langgraph-hitl.test.ts` y `examples/human-in-the-loop.ts`.

Ejecutar la demostración sin red ni credenciales:

```bash
npm run example:hitl
```

## Ejercicios

1. Pausar y reanudar con el mismo session ID.
2. Rechazar una acción y comprobar que no se ejecuta.
3. Poner un efecto antes del interrupt y detectar su repetición.

## Referencias verificadas

- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
