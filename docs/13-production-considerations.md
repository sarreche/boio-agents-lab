# 13 — Consideraciones de producción

## Alcance

Que el laboratorio use prácticas de producción no significa convertirlo en una plataforma enterprise. Esta guía enumera límites que deben ser visibles desde el inicio.

## Fiabilidad

- Timeouts separados para modelo, tool y run completo.
- Retries acotados con backoff y jitter solo para fallos transitorios.
- Idempotencia para efectos que puedan repetirse al reanudar un nodo.
- Límites de pasos y profundidad aplicados fuera del prompt.
- Errores tipados para provider, rate limit, timeout, tool, output, persistence y delegation.

## Seguridad

- Tools con mínimo privilegio y autorización por agente.
- Sin shell arbitrario.
- Paths de archivo resueltos y comprobados dentro del sandbox.
- Argumentos y outputs validados.
- Secrets fuera del repositorio y redactados en logs/traces.
- Límites de tamaño para inputs, outputs, archivos y payloads persistidos.

## Operación

Las métricas mínimas serán latencia, tokens, modelo/provider, tools, errores, evaluaciones y relaciones padre-hijo. El sistema debe funcionar con `NoopTracer`; una caída de Langfuse no debe derribar una ejecución salvo que una política explícita lo exija.

`MemorySaver` sirve para desarrollo y tests: se pierde al reiniciar, no coordina varias instancias y no implementa retención. Un futuro almacenamiento durable necesitará migraciones, conexiones acotadas, timeouts y estrategia de retención. Los checkpoints persistidos vuelven cada cambio de estado un problema de compatibilidad: nodos, channels y rutas viejas no deben borrarse sin una migración o ventana de drenaje.

## Trade-offs

La durabilidad incrementa complejidad: los nodos reanudables deben ser deterministas o idempotentes. Capturar payloads completos mejora debugging, pero eleva costo y riesgo de datos; la política predeterminada será metadata útil y contenido configurable/redactado.

El runtime explícito ya aplica un retry acotado al nodo del modelo, serializa errores y pausa antes de efectos protegidos. La identidad `actor` del ejemplo no está autenticada, y `MemorySaver` no es durable; ambas son fronteras explícitas, no garantías de producción. La clasificación fina de errores transitorios del provider y un timeout global del run siguen pendientes; reintentar indiscriminadamente efectos no idempotentes sería incorrecto.

## Dónde mirar

Hoy: `.env.example`, `AGENTS.md`, CI, `src/graph/`, `src/core/errors.ts` y `src/tools/registry.ts`. Más adelante: adapters de persistence, clasificación de errores de provider y tracers.

## Ejercicios

1. Identificar qué nodos podrían ejecutar dos veces tras un crash.
2. Diseñar una política de redacción para prompts con datos personales.
3. Definir SLOs simples para latencia, error rate y regresiones de calidad.
