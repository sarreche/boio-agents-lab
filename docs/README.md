# Guía de estudio

La documentación sigue el orden conceptual en que conviene aprender el sistema. El estado de cada capítulo evita confundir diseño con funcionalidad disponible.

| Capítulo                          | Estado inicial             | Slice de implementación |
| --------------------------------- | -------------------------- | ----------------------- |
| `01-architecture.md`              | Fundamento documentado     | Todos                   |
| `02-langgraph-runtime.md`         | Implementado               | Runtime explícito       |
| `03-agent-state.md`               | Implementado               | Runtime explícito       |
| `04-tools.md`                     | Implementado               | Tools y autorización    |
| `05-model-providers.md`           | Registry/provider estático | Providers               |
| `06-persistence.md`               | Implementado con memoria   | Checkpoints y sesiones  |
| `07-memory.md`                    | Esqueleto de diseño        | Memoria                 |
| `08-subagents.md`                 | Implementado               | Delegación              |
| `09-deep-agents.md`               | Implementado               | Runtime comparativo     |
| `10-observability.md`             | Implementado               | Trazas y Langfuse       |
| `11-evaluations.md`               | Implementado               | Evals                   |
| `12-human-in-the-loop.md`         | Implementado               | Interrupt/resume        |
| `13-production-considerations.md` | Fundamento documentado     | Transversal             |
| `14-http-api.md`                  | Implementado               | API HTTP                |

Las decisiones durables están en `adr/`. La hoja de ruta ordena slices verticales que deben dejar el repositorio ejecutable en cada etapa.

La especificación base vive en `specification/initial-requirements.md`. Cuando el alcance cambia, se actualiza y una ADR conserva la decisión y su motivo; Git mantiene el historial completo.
