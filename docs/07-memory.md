# 07 — Memoria

## Problema y funcionamiento

Short-term memory es el estado contextual de una sesión/run conservado por checkpoints. Long-term memory son hechos recuperables entre sesiones, con identidad, origen y ciclo de vida propios. Mezclarlas vuelve imposible razonar sobre retención y relevancia.

El almacenamiento de largo plazo queda sin tecnología asignada. Primero se definirán operaciones, identidad, provenance, actualización y borrado; solo después se elegirá un backend según requisitos medibles. La búsqueda semántica tampoco se añadirá sin un caso que la justifique.

## Decisiones y trade-offs

La simplicidad sacrifica recall difuso, pero permite estudiar provenance, actualización y borrado. No todo mensaje se transforma automáticamente en memoria durable.

## Ubicación y lectura

La memoria de corto plazo implementada vive en el state/checkpointer explicado en `docs/03-agent-state.md` y `docs/06-persistence.md`. Long-term memory queda explícitamente fuera del roadmap completado: no se crea un `src/memory/` vacío ni un store sin política de identidad, provenance, retención y borrado.

## Ejercicios

1. Decidir qué información merece persistir entre sesiones.
2. Resolver un conflicto entre dos memorias.
3. Implementar expiración sin afectar checkpoints.
