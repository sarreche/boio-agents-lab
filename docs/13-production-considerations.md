# 13 — Consideraciones de producción

## Alcance

Que el laboratorio use prácticas de producción no significa convertirlo en una plataforma enterprise. Esta guía enumera límites que deben ser visibles desde el inicio.

## Garantías implementadas

- Deadlines separados para model call, tool y run completo.
- Cancelación cooperativa mediante `AbortSignal`, además de rechazo local al vencer el deadline.
- Retries acotados en el nodo de modelo del runtime explícito; las tools con efectos no se reintentan automáticamente.
- Idempotencia para efectos que puedan repetirse al reanudar un nodo.
- Límites de pasos y profundidad aplicados fuera del prompt.
- Allowlist independiente para cada child y techo de profundidad heredado desde la raíz.
- Errores tipados para timeout de run/model, tool, output, lifecycle de sesión, migración y delegation. Los errores específicos del provider permanecen como `cause` de `AgentExecutionError`.
- Migraciones explícitas de state v1/v2 a v3 y rechazo fail-closed de versiones futuras.

## Seguridad

- Tools con mínimo privilegio y autorización por agente.
- Sin shell arbitrario.
- Paths de archivo resueltos y comprobados dentro del sandbox.
- Argumentos y outputs validados.
- Secrets fuera del repositorio y redactados en logs/traces.
- Límites de tamaño para inputs, outputs, archivos y payloads persistidos.

## Operación

Las trazas implementadas registran latencia, modelo/provider, tools, errores, evaluaciones y relaciones padre-hijo cuando están disponibles. El runner agrega token usage y costo mediante un extractor explícito; la normalización automática por provider sigue pendiente. El sistema funciona con `NoopTracer`; una caída de Langfuse o del writer local no derriba ni repite una ejecución.

`MemorySaver` sirve para desarrollo y tests: se pierde al reiniciar, no coordina varias instancias y no implementa retención. Un futuro almacenamiento durable necesitará conexiones acotadas, timeouts y estrategia de retención. La cadena de migración del state del proyecto ya existe, pero el formato interno del checkpoint del adapter también deberá comprobarse antes de elegir tecnología.

CI ejecuta format, lint, TypeScript, cobertura, evals, regresión y build. La cobertura global exige al menos 80 % en statements, branches, functions y lines; no sustituye los datasets de calidad.

## Trade-offs

La durabilidad incrementa complejidad: los nodos reanudables deben ser deterministas o idempotentes. Capturar payloads completos mejora debugging, pero eleva costo y riesgo de datos; la política predeterminada será metadata útil y contenido configurable/redactado.

El runtime explícito aplica retry acotado al nodo del modelo, serializa errores y pausa antes de efectos protegidos. Todos los runtimes aplican deadline global; el explícito añade timeout por model call y las tools mantienen su propio límite. La identidad `actor` no está autenticada y `MemorySaver` no es durable; son límites declarados del laboratorio, no garantías de despliegue.

El deadline libera al caller aunque una dependencia ignore `AbortSignal`, pero no puede detener por fuerza código externo no cooperativo. Por eso una tool con efecto sigue necesitando idempotency key propia. La clasificación fina de rate limits/transitorios depende de adapters de provider reales y no se simula con una taxonomía falsa.

La delegación actual es síncrona y secuencial. Producción necesitará presupuestos agregados de tokens/tiempo entre padre e hijos, cancelación propagada, una política para children interrumpidos y reglas explícitas antes de habilitar fan-out paralelo.

## Dónde mirar

Hoy: `.env.example`, `AGENTS.md`, CI, `src/core/execution-deadline.ts`, `src/persistence/agent-state-migrations.ts`, `src/graph/`, `src/core/errors.ts`, `src/tools/registry.ts`, `src/observability/` y `src/evals/`. Quedan deliberadamente fuera del laboratorio los adapters durables sin requisitos, autenticación de producto y normalización específica de usage/costos por provider.

## Ejercicios

1. Identificar qué nodos podrían ejecutar dos veces tras un crash.
2. Diseñar una política de redacción para prompts con datos personales.
3. Definir SLOs simples para latencia, error rate y regresiones de calidad.
