# 12 — Human in the loop

## Problema y funcionamiento

Acciones de riesgo pueden requerir aprobación sin mantener un proceso vivo. Un nodo llamará `interrupt()` con payload serializable; el checkpointer guardará el estado y el caller recibirá la interrupción. Resume invocará el mismo thread con `Command({ resume: decision })`.

El nodo que contiene el interrupt puede empezar nuevamente al reanudar. Por eso el trabajo previo debe ser determinista/idempotente y el interrupt no se envolverá en un `try/catch` que capture la señal interna.

## Decisiones y trade-offs

Se usarán interrupciones dinámicas en vez de breakpoints estáticos. La primera demo será CLI/API sin interfaz gráfica. La aprobación incluirá actor, decisión y timestamp en metadata auditable.

## Ubicación y lectura

Planeado: nodo de aprobación, métodos `run/resume`, `examples/human-in-the-loop.ts` y tests con MemorySaver.

## Ejercicios

1. Pausar y reanudar con el mismo session ID.
2. Rechazar una acción y comprobar que no se ejecuta.
3. Poner un efecto antes del interrupt y detectar su repetición.
