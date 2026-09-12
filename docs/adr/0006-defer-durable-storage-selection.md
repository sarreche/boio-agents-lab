# ADR 0006 — Diferir la elección de almacenamiento durable

- Estado: accepted
- Fecha: 2026-09-12

## Contexto

La configuración inicial incluía un servidor de base de datos, driver y adapter de checkpoints antes de tener requisitos de despliegue, concurrencia, retención o consultas. Para estudiar checkpoints e interacción human-in-the-loop, LangGraph ya ofrece `MemorySaver` sin infraestructura externa.

## Decisión

Se eliminan el servidor local, driver, variables de entorno y dependencia del adapter durable prematuro. El punto 5 implementará el protocolo de checkpoints, `thread_id`, interrupt y resume con `MemorySaver`.

No se elige un reemplazo todavía. La tecnología durable se evaluará cuando existan requisitos concretos y deberá entrar detrás de un boundary probado, sin modificar definiciones de agentes ni nodos.

## Consecuencias

El laboratorio queda más simple y el aprendizaje se concentra en la semántica de persistencia. El estado en memoria se pierde al reiniciar el proceso y no puede compartirse entre instancias; los ejemplos y documentos deben declarar esa limitación.

Git conserva la decisión inicial en el historial. Si una necesidad durable aparece, una nueva ADR comparará alternativas por durabilidad, operación, costo, portabilidad y compatibilidad con LangGraph.
