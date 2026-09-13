# 05 — Model providers

## Problema y funcionamiento

Los agentes describen un `ModelConfig`; no importan SDKs. `ModelProviderRegistry` resuelve provider + modelo a un `BaseChatModel`. OpenRouter reutilizará el cliente compatible con OpenAI con base URL propia; OpenAI, Gemini, Groq y Ollama tendrán factories separadas en slices posteriores.

El runtime es responsable de structured output y, más adelante, tool binding, porque esas capacidades dependen del caso de ejecución. `DirectModelRuntime` llama `withStructuredOutput()` y vuelve a validar el valor con Zod: incluso un provider o fake que ignore el schema no atraviesa el boundary con datos malformados.

`StaticModelProvider` permite inyectar un modelo preconstruido. El ejemplo usa el `fakeModel()` oficial de LangChain, por lo que demuestra el recorrido completo sin API keys ni tráfico de red.

## Decisiones y trade-offs

La interfaz devuelve la primitiva de LangChain en lugar de inventar un modelo universal, reduciendo adaptación y conservando tool calling. El precio es que `src/runtime` y `src/graph` conocen tipos de LangChain; `src/core` sigue independiente.

El registry rechaza providers duplicados y ausentes con errores tipados. No existe fallback silencioso, porque podría enviar datos a un proveedor distinto del configurado.

## Ubicación y lectura

Implementado: `src/models/model-provider.ts`, `src/models/registry.ts`, `src/models/static-model-provider.ts`, los runtimes y sus tests. Los adapters concretos por proveedor quedan fuera del laboratorio hasta existir requisitos de producto; añadir clases que solo reenvíen opciones de SDK no aportaría una frontera nueva. Los tests usan modelos falsos, nunca APIs reales.

## Ejercicios

1. Cambiar provider sin modificar una definición.
2. Simular rate limit y timeout.
3. Comparar capacidades declaradas de dos providers.
