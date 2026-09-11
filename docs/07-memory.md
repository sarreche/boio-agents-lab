# 07 — Memoria

## Problema y funcionamiento

Short-term memory es el estado contextual de una sesión/run conservado por checkpoints. Long-term memory son hechos recuperables entre sesiones, con identidad, origen y ciclo de vida propios. Mezclarlas vuelve imposible razonar sobre retención y relevancia.

La primera implementación de largo plazo será PostgreSQL simple, sin vector database: escritura explícita y recuperación por claves/metadata. Solo se añadirá búsqueda semántica cuando exista un caso medible.

## Decisiones y trade-offs

La simplicidad sacrifica recall difuso, pero permite estudiar provenance, actualización y borrado. No todo mensaje se transforma automáticamente en memoria durable.

## Ubicación y lectura

Planeado: `src/memory/memory-store.ts`, `short-term.ts` y `long-term.ts`.

## Ejercicios

1. Decidir qué información merece persistir entre sesiones.
2. Resolver un conflicto entre dos memorias.
3. Implementar expiración sin afectar checkpoints.
