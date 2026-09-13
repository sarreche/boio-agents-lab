# ADR 0012 — API HTTP fina e índice de consultas separado

- Estado: accepted
- Fecha: 2026-09-13

## Contexto

El punto 10 requiere iniciar y reanudar agentes y consultar runs y sesiones. Los checkpoints de LangGraph representan snapshots de ejecución, no un modelo de lectura HTTP. Acoplar las rutas al checkpointer filtraría detalles del runtime y haría que otros adapters no pudieran implementar el mismo contrato.

## Decisión

La API será un adapter Fastify fino construido mediante inyección. `HttpAgentRegistry` define explícitamente qué `StructuredAgent` están expuestos. Las rutas validan params y body con Zod, delegan la operación y guardan el outcome normalizado en un `ApiRunStore` independiente.

Se incluye un índice en memoria para desarrollo y tests. No se elige todavía un backend durable: esa elección exige requisitos de despliegue, retención y concurrencia. Los estados HTTP distinguen ejecución completa (`200`), interrupción pendiente (`202`), request inválido (`400`), recurso ausente (`404`), conflicto de sesión (`409`) y operación semánticamente no soportada (`422`).

## Consecuencias

El transporte no contiene comportamiento de agentes y puede probarse sin sockets. Cualquier runtime que implemente `StructuredAgent` puede registrarse sin que Fastify conozca su tecnología. A cambio, reiniciar el proceso pierde los lookups del store predeterminado, incluso si un checkpointer durable conservase la ejecución; producción deberá inyectar un store durable y coordinar escrituras concurrentes.

La identidad `actor` recibida al reanudar sigue siendo una afirmación del caller. Autenticación, autorización, rate limiting e idempotency keys quedan explícitamente para el endurecimiento del punto 11.

## Referencias verificadas

- Fastify v5 instalado: `fastify@5.12.4`.
- Contrato del proyecto: `src/core/agent-runtime.ts`.
- Lifecycle de sesiones: ADR 0007.
