# ADR 0001 — Identidad y sistema de módulos

- Estado: accepted
- Fecha: 2026-09-11

## Contexto

La carpeta solicitada se llama `boio-agents-lab`; la especificación llama **MiniAgents** a la biblioteca. El ecosistema actual de LangChain JavaScript usa paquetes ESM y el entorno local disponible es Node.js 22.

## Decisión

El repositorio y paquete privado se llaman `boio-agents-lab`; MiniAgents es el nombre conceptual/documental. Se usa ESM, resolución NodeNext y Node.js 22 como baseline. Los imports relativos TypeScript incluyen extensión `.js` para que el output sea válido en Node.

## Consecuencias

El eventual nombre de paquete público queda abierto y no requiere renombrar hoy el repositorio. Herramientas y ejemplos deben funcionar bajo ESM; no se mantendrá una configuración CommonJS paralela sin un caso real.
