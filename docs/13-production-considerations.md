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

PostgreSQL necesitará migraciones, pool acotado, timeouts y estrategia de retención. Los checkpoints persistidos vuelven cada cambio de estado un problema de compatibilidad: nodos, channels y rutas viejas no deben borrarse sin una migración o ventana de drenaje.

## Trade-offs

La durabilidad incrementa complejidad: los nodos reanudables deben ser deterministas o idempotentes. Capturar payloads completos mejora debugging, pero eleva costo y riesgo de datos; la política predeterminada será metadata útil y contenido configurable/redactado.

## Dónde mirar

Hoy: `.env.example`, `AGENTS.md`, `docker-compose.yml` y CI. Más adelante: adapters de persistence, retry policy, error taxonomy y tracers.

## Ejercicios

1. Identificar qué nodos podrían ejecutar dos veces tras un crash.
2. Diseñar una política de redacción para prompts con datos personales.
3. Definir SLOs simples para latencia, error rate y regresiones de calidad.
