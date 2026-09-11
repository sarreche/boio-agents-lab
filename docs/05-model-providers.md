# 05 — Model providers

## Problema y funcionamiento

Los agentes describen un `ModelConfig`; no importan SDKs. Un registry resolverá provider + modelo a un `BaseChatModel`. OpenRouter reutilizará el cliente compatible con OpenAI con base URL propia; OpenAI, Gemini, Groq y Ollama tendrán factories separadas.

El runtime será responsable de structured output y tool binding, porque esas capacidades dependen del caso de ejecución. Los adapters traducirán errores externos a categorías propias sin eliminar el `cause`.

## Decisiones y trade-offs

La interfaz devuelve la primitiva de LangChain en lugar de inventar un modelo universal, reduciendo adaptación y conservando tool calling. El precio es que `src/runtime` y `src/graph` conocen tipos de LangChain; `src/core` sigue independiente.

## Ubicación y lectura

Planeado: `src/models/model-provider.ts`, `src/models/registry.ts` y `src/models/providers/`. Tests con modelos falsos, nunca con APIs reales.

## Ejercicios

1. Cambiar provider sin modificar una definición.
2. Simular rate limit y timeout.
3. Comparar capacidades declaradas de dos providers.
