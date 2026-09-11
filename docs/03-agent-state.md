# 03 — Estado del agente

## Problema

El estado conecta pasos que pueden reintentarse, persistirse o reanudarse. Si mezcla objetos vivos con datos serializables, los checkpoints dejan de ser confiables. Si mezcla sesión con ejecución, la observabilidad se vuelve ambigua.

## Forma prevista

El estado mínimo incluirá mensajes, número de paso, resultados de tools, metadata, `sessionId`, `runId`, errores serializados, referencia opcional al padre y resultados/referencias de child runs. Las colecciones acumulativas tendrán reducers explícitos; los valores escalares se reemplazarán de manera consciente.

Los nodos recibirán estado inmutable y retornarán actualizaciones parciales. Un router no llamará modelos, tools ni bases de datos. El estado persistido tendrá una versión de esquema para poder razonar sobre checkpoints antiguos.

## Identidades

- `sessionId`: continuidad lógica entre invocaciones.
- `runId`: intento individual, con inicio, fin, consumo y resultado.
- `parentRunId`: relación de delegación, no sustituto del run hijo.
- `thread_id` de LangGraph: cursor de checkpoints; el adapter mapeará explícitamente su relación con `sessionId`.

## Trade-offs

Guardar todo facilita debugging pero aumenta costo, exposición de datos y problemas de compatibilidad. El diseño conservará referencias y resúmenes donde el payload completo no sea necesario. Los errores se serializan sin perder código/categoría, pero no se persisten objetos `Error` crudos.

## Dónde mirar

El contrato aún no está implementado. Cuando lo esté, leer `src/graph/state.ts`, luego reducers, nodos y tests de transición.

## Ejercicios

1. Clasificar cada campo como acumulativo o reemplazable.
2. Simular dos runs bajo una sesión y un child run.
3. Diseñar una migración al agregar un campo obligatorio al checkpoint.
