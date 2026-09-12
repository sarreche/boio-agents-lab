# Guía de estudio

La documentación sigue el orden conceptual en que conviene aprender el sistema. El estado de cada capítulo evita confundir diseño con funcionalidad disponible.

| Capítulo                          | Estado inicial             | Slice de implementación |
| --------------------------------- | -------------------------- | ----------------------- |
| `01-architecture.md`              | Fundamento documentado     | Todos                   |
| `02-langgraph-runtime.md`         | Diseño + precursor directo | Runtime explícito       |
| `03-agent-state.md`               | Fundamento documentado     | Runtime explícito       |
| `04-tools.md`                     | Esqueleto de diseño        | Tools y autorización    |
| `05-model-providers.md`           | Registry/provider estático | Providers               |
| `06-persistence.md`               | Esqueleto de diseño        | Checkpoints y sesiones  |
| `07-memory.md`                    | Esqueleto de diseño        | Memoria                 |
| `08-subagents.md`                 | Esqueleto de diseño        | Delegación              |
| `09-deep-agents.md`               | Fundamento documentado     | Runtime comparativo     |
| `10-observability.md`             | Esqueleto de diseño        | Trazas y Langfuse       |
| `11-evaluations.md`               | Esqueleto de diseño        | Evals                   |
| `12-human-in-the-loop.md`         | Esqueleto de diseño        | Interrupt/resume        |
| `13-production-considerations.md` | Fundamento documentado     | Transversal             |

Las decisiones durables están en `adr/`. La hoja de ruta ordena slices verticales que deben dejar el repositorio ejecutable en cada etapa.

La solicitud original se conserva sin modificaciones funcionales en `specification/initial-requirements.md`, para mantener trazabilidad entre requerimientos, decisiones y código.
