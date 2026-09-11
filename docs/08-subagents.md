# 08 — Subagentes

## Problema y funcionamiento

La delegación divide tareas y aísla contexto, pero puede crear loops, escalada de privilegios y trazas imposibles de seguir. El coordinator resolverá un agente registrado, validará autorización y profundidad, iniciará un child run independiente y devolverá un resultado estructurado al padre.

Cada hijo usa su propia allowlist de tools. `parentRunId`, profundidad y referencias de child runs preservan la relación sin fusionar estados completos.

## Decisiones y trade-offs

La profundidad máxima se aplica en runtime y no depende de que el modelo obedezca. Inicialmente la delegación será secuencial para facilitar trazas y límites; el paralelismo se agregará solo con política explícita de fallos y presupuesto.

## Ubicación y lectura

Planeado: `src/subagents/registry.ts`, `coordinator.ts` y el nodo `delegate-agent.ts`.

## Ejercicios

1. Crear un ciclo A → B → A y observar el límite.
2. Hacer fallar un hijo y comparar políticas fail-fast/degraded.
3. Verificar que el coordinator no hereda tools al hijo.
