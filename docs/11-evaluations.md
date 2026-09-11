# 11 — Evaluaciones

## Problema y funcionamiento

Los tests validan invariantes de software; las evals miden comportamiento probabilístico. El runner recibirá dataset, agente y evaluadores, y devolverá casos, scores, latencia, uso, fallos y agregados.

Los evaluadores determinísticos cubrirán schema, campos, tools requeridas/prohibidas, pasos, latencia y costo. LLM-as-a-Judge usará otro modelo y una rúbrica Zod estructurada. Regression comparará agregados con thresholds y terminará con código no cero si caen.

## Decisiones y trade-offs

Los evaluadores fallan de forma visible: un fallo del judge no se cuenta como mala calidad ni como aprobación. Datasets pequeños versionados ofrecen una línea base reproducible; las llamadas reales serán opt-in y separadas de CI.

## Ubicación y lectura

Planeado: `src/evals/`, datasets versionados y `tests/evals/`/`tests/regression/`. Los comandos ya existen con un sentinel inicial.

## Ejercicios

1. Diseñar un caso que exija search y prohíba filesystem.
2. Cambiar un threshold y observar el exit code.
3. Medir desacuerdo entre dos judges.
