# 04 — Tools

## Problema y funcionamiento

Una tool convierte texto/model output no confiable en un efecto del sistema. El registry almacenará nombre, descripción, esquema Zod y executor. La resolución recibirá también la allowlist del agente y rechazará cualquier nombre no autorizado antes de validar/ejecutar argumentos.

Los built-ins iniciales serán mock search, calculator, clock inyectable y lectura/escritura dentro de un root sandboxed. No habrá shell arbitrario. Cada ejecución tendrá timeout, resultado estructurado y span propio.

## Decisiones y trade-offs

Autorización por capacidad explícita, no por prompt. El filesystem resolverá paths canónicos y verificará pertenencia al root. Un registry inyectable agrega wiring pero evita contaminación global entre tests.

## Ubicación y lectura

Planeado: `src/tools/tool.ts`, `src/tools/registry.ts`, `src/tools/authorize-tool.ts` y `src/tools/builtins/`. Leer contrato, registry, autorización y luego adaptador LangChain.

## Ejercicios

1. Intentar path traversal y una symlink escape.
2. Registrar dos tools con el mismo nombre.
3. Verificar que una tool existente pero no autorizada nunca se ejecuta.
