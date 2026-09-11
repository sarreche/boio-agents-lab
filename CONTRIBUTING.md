# Contribuir a boio-agents-lab

Este proyecto combina una biblioteca con material de estudio. Una contribución no está terminada si el código y la explicación divergen.

## Flujo local

1. Parte de `main` actualizado.
2. Crea una rama con tipo y nombre corto, por ejemplo `feat/tool-registry`.
3. Implementa un cambio cohesivo con tests deterministas.
4. Actualiza el documento numerado y crea una ADR si cambia una decisión persistente o pública.
5. Ejecuta el conjunto de verificaciones de `AGENTS.md`.
6. Usa Conventional Commits, por ejemplo `feat(tools): enforce per-agent authorization`.

## Pull requests

La descripción debe explicar el problema, la decisión, cómo se verificó y las limitaciones conocidas. Los cambios de estado persistido deben describir compatibilidad y migración. Los cambios de agentes deben indicar tools autorizadas, límites y cobertura de evals.

## Comentarios y documentación

Los comentarios de código explican invariantes o decisiones no obvias. Los documentos de `docs/` enseñan el sistema y pueden ser más extensos. Evita comentarios que solo repitan el nombre de la función o la línea siguiente.

## Dependencias

Añade una dependencia solo si reduce complejidad total o aporta una primitiva que no conviene mantener localmente. Fija versiones exactas y documenta upgrades incompatibles. Para LangChain, LangGraph, Deep Agents y Langfuse, verifica primero documentación oficial y compatibilidad entre peers.
