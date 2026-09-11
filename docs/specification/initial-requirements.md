Quiero que construyas un proyecto llamado **MiniAgents**, una biblioteca/framework liviano de miniagentes en TypeScript.

El objetivo es crear una base extensible para definir, ejecutar, observar, persistir y evaluar pequeños agentes especializados, incluyendo soporte para subagentes y una integración opcional con Deep Agents.

No quiero construir un clon completo de OpenClaw ni un framework excesivamente abstracto. La prioridad es tener una arquitectura clara, modular, comprensible y útil para estudiar en profundidad los distintos componentes de un sistema agentic moderno.

## Objetivo del proyecto

Quiero poder definir agentes especializados como:

- researcher
- summarizer
- writer
- reviewer
- planner
- file-analyzer
- coding-assistant

Cada agente debe poder tener:

- nombre
- descripción
- system prompt
- modelo
- tools habilitadas
- límites de ejecución
- configuración
- estado
- metadata
- memoria
- persistence
- tracing
- evaluators asociados
- subagentes opcionales

Ejemplo conceptual:

```ts
const researcher = defineAgent({
  name: "researcher",
  description: "Researches a topic using available tools",
  model: "openrouter:...",
  systemPrompt: "...",
  tools: ["webSearch"],
  maxSteps: 10,
});
```

Luego debería poder ejecutarse así:

```ts
const result = await researcher.run({
  input: "Research the current state of agentic AI",
});
```

## Stack tecnológico

Usar:

- TypeScript
- Node.js
- LangChain JS
- LangGraph JS
- Deep Agents
- Langfuse
- PostgreSQL
- Zod
- Vitest
- ESLint
- Prettier

Preparar integración con:

- OpenRouter
- Gemini
- Groq
- OpenAI
- Ollama

No es obligatorio implementar todos los providers con el mismo nivel de profundidad, pero la arquitectura debe permitir cambiar de provider sin modificar los agentes.

## Principios de arquitectura

Quiero una arquitectura explícita y fácil de estudiar.

No ocultes innecesariamente LangGraph detrás de demasiadas abstracciones.

Quiero poder comprender claramente:

- state
- nodes
- edges
- conditional edges
- tool execution
- model calls
- checkpoints
- execution loop
- persistence
- tracing
- evaluation
- subagent delegation

Evitar "magic abstractions".

Aplicar separación de responsabilidades.

Preferir composición sobre herencia.

No crear una arquitectura enterprise innecesariamente compleja.

La prioridad es que el proyecto sea simultáneamente:

1. funcional
2. didáctico
3. extensible
4. testeable
5. observable

## Arquitectura general

Quiero una separación aproximadamente de este estilo:

```text
src/

  core/
    agent.ts
    agent-definition.ts
    agent-types.ts
    state.ts
    runtime.ts
    execution-context.ts

  graph/
    create-agent-graph.ts
    nodes/
      call-model.ts
      execute-tools.ts
      delegate-agent.ts
      finalize.ts

  runtime/
    langgraph-runtime.ts
    deepagents-runtime.ts

  models/
    model-provider.ts
    registry.ts
    providers/
      openrouter.ts
      openai.ts
      gemini.ts
      groq.ts
      ollama.ts

  tools/
    tool.ts
    registry.ts
    builtins/

  agents/
    researcher.ts
    summarizer.ts
    writer.ts
    reviewer.ts
    planner.ts

  subagents/
    registry.ts
    coordinator.ts

  persistence/
    checkpointer.ts
    memory-checkpointer.ts
    postgres-checkpointer.ts
    session-store.ts

  memory/
    memory-store.ts
    short-term.ts
    long-term.ts

  observability/
    tracer.ts
    console-tracer.ts
    langfuse-tracer.ts

  evals/
    evaluator.ts
    dataset.ts
    runner.ts
    deterministic/
    llm-judge/
    regression/

  config/

  index.ts

examples/

tests/
```

Podés mejorar esta estructura si encontrás una forma más limpia, pero explicá las decisiones.

## Agentes mínimos a implementar

Crear al menos estos agentes funcionales:

### Summarizer

Recibe texto y devuelve:

```ts
{
  summary: string;
  keyPoints: string[];
}
```

Usar structured output.

### Researcher

Recibe una pregunta.

Puede usar una tool de búsqueda.

Debe decidir cuándo investigar y cuándo terminar.

### Reviewer

Recibe un texto y devuelve:

```ts
{
  score: number;
  issues: string[];
  suggestions: string[];
}
```

### Planner

Recibe un objetivo y produce un plan estructurado de pasos.

### Coordinator

Debe poder delegar tareas a otros agentes.

Por ejemplo:

```text
Coordinator
   ├── Researcher
   ├── Writer
   └── Reviewer
```

## Tool system

Crear un registry explícito de tools.

Quiero poder hacer algo similar a:

```ts
registerTool({
  name: "search",
  description: "...",
  schema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => {
    ...
  },
});
```

Los agentes deben declarar explícitamente qué tools pueden utilizar.

Nunca dar automáticamente todas las tools a todos los agentes.

Implementar al menos:

- mock search
- calculator
- current-time/mock utility
- file read/write sandboxed

No implementar shell arbitrario inseguro.

## Model provider abstraction

Crear una interfaz desacoplada del provider.

Por ejemplo:

```ts
interface ModelProvider {
  getModel(config: ModelConfig): BaseChatModel;
}
```

La configuración debe permitir algo similar a:

```ts
{
  provider: "openrouter",
  model: "...",
  temperature: 0
}
```

No acoplar los agentes directamente a OpenAI.

Crear un registry de providers.

## LangGraph

Usar LangGraph de manera real.

No implementar manualmente un agent loop si LangGraph ya proporciona primitivas adecuadas.

Pero tampoco quiero esconder el grafo detrás de una abstracción opaca.

Quiero que sea fácil inspeccionar algo como:

```text
START
  ↓
callModel
  ↓
hasToolCalls?
 ├─ yes → executeTools → callModel
 ├─ delegate → subagent → callModel
 └─ no → END
```

Mantener el estado explícito.

El state debe incluir como mínimo:

- messages
- current step
- step count
- tool results
- metadata
- session id
- run id
- errors
- optional parent agent
- optional child runs

## Runtime abstraction

Quiero dos runtimes:

```text
AgentDefinition
       │
       ▼
AgentRuntime
   ┌───┴────────────┐
   │                │
LangGraphRuntime   DeepAgentsRuntime
```

### LangGraphRuntime

Debe implementar el comportamiento de forma explícita usando LangGraph.

Este runtime debe ser el más didáctico y permitir estudiar:

- state
- nodes
- edges
- retries
- checkpoints
- tools
- delegation

### DeepAgentsRuntime

Debe implementar una variante equivalente usando Deep Agents.

La intención es poder comparar ambas aproximaciones.

No intentar hacer que ambos runtimes sean idénticos internamente.

Quiero entender qué abstracciones Deep Agents resuelve por nosotros.

## Persistence

Implementar persistencia real.

Debe existir:

### MemoryCheckpointer

Para desarrollo y tests.

### PostgreSQL persistence

Para:

- sessions
- checkpoints
- run metadata

Permitir:

```ts
await agent.run({
  input,
  sessionId: "session-123",
});
```

Y después continuar una ejecución o conversación usando el mismo session ID.

Quiero estudiar explícitamente:

- checkpoints
- resume
- durable state
- session continuity

## Memory

Separar conceptualmente:

### Short-term memory

Estado de la ejecución/conversación actual.

### Long-term memory

Información persistente recuperable entre sesiones.

No crear un sistema sofisticado de memoria semántica si no es necesario.

Una implementación simple basada en PostgreSQL es suficiente.

Documentar claramente la diferencia entre ambas.

## Subagents

Implementar delegación entre agentes.

Ejemplo:

```text
Coordinator
     ↓
 decide task
     ↓
Researcher
     ↓
returns result
     ↓
Writer
     ↓
Reviewer
```

Cada subagente debe tener:

- su propio run
- su propio trace
- sus tools autorizadas
- estado independiente cuando corresponda

El coordinator debe recibir el resultado del subagente de forma estructurada.

Evitar loops infinitos de delegación.

Incluir límites de profundidad.

## Observabilidad

Integrar Langfuse de forma real.

Quiero observar:

- agent runs
- model calls
- tool calls
- subagent calls
- latency
- token usage
- model
- provider
- errors
- evaluation scores

Crear también:

- ConsoleTracer
- NoopTracer
- LangfuseTracer

La aplicación no debe depender directamente de Langfuse.

Debe existir una interfaz propia.

Ejemplo conceptual:

```ts
interface Tracer {
  startRun(...)
  startSpan(...)
  logModelCall(...)
  logToolCall(...)
  logError(...)
  endSpan(...)
  endRun(...)
}
```

## Prompt management

Preparar el sistema para versionar prompts.

Cada ejecución debería poder registrar:

- prompt name
- prompt version
- model
- temperature
- runtime

Si Langfuse permite almacenar/versionar prompts de forma limpia, integrar esa capacidad.

## Evaluations

Implementar un sistema de evaluaciones funcional.

Quiero cubrir tres tipos.

### 1. Deterministic evaluators

Ejemplos:

- schema validity
- required fields
- expected tool
- forbidden tool
- max step count
- latency threshold
- cost threshold

### 2. LLM-as-a-Judge

Crear una abstracción para evaluar outputs mediante otro modelo.

Ejemplo de rúbrica:

```text
Correctness: 0-4
Completeness: 0-4
Relevance: 0-4
Groundedness: 0-4
```

El resultado debe ser estructurado.

### 3. Regression evaluation

Poder ejecutar un dataset completo y comparar resultados.

Ejemplo:

```ts
await runEvaluation({
  dataset: researchDataset,
  agent: researcher,
  evaluators: [...]
});
```

El resultado debe incluir:

- pass/fail
- scores
- latency
- token usage
- failures
- summary statistics

## Evaluation datasets

Crear al menos un pequeño dataset de prueba.

Por ejemplo:

```ts
{
  input: "...",
  expectedBehavior: "...",
  expectedTools: ["search"],
  forbiddenTools: [],
  tags: ["research", "simple"]
}
```

Debe ser sencillo añadir nuevos casos.

## CI-friendly evals

Crear comandos como:

```bash
npm run test
npm run eval
npm run eval:regression
```

`eval:regression` debe retornar código de error si el sistema cae por debajo de thresholds definidos.

Esto debe poder usarse posteriormente en CI/CD.

## Human-in-the-loop

Implementar al menos un ejemplo sencillo.

Por ejemplo:

```text
Agent
 ↓
prepare action
 ↓
requires approval?
 ↓
pause
 ↓
human approves
 ↓
resume
```

Quiero poder estudiar cómo LangGraph maneja interrupciones y resume.

No hace falta construir UI.

Puede demostrarse mediante CLI o API.

## Error handling

Manejar explícitamente:

- provider failure
- timeout
- rate limit
- malformed model output
- tool failure
- max steps reached
- invalid tool arguments
- persistence errors
- evaluator failure
- subagent failure

Definir errores tipados cuando sea útil.

No tragarse errores silenciosamente.

## Reliability

Agregar soporte razonable para:

- retries
- exponential backoff
- timeouts
- max execution steps
- subagent depth limit

No crear infraestructura excesivamente sofisticada.

## Tests

Crear tests unitarios y de integración para:

- agent creation
- model abstraction
- tool registry
- tool authorization
- state transitions
- max steps
- structured output
- persistence
- resume
- subagent delegation
- depth limits
- LangGraph runtime
- Deep Agents runtime
- evaluators
- tracing
- error handling

Los tests no deben depender de APIs reales.

Crear mocks/fakes de modelos y providers.

## Ejemplos

Crear al menos:

```text
examples/
  basic-summarizer.ts
  researcher.ts
  coordinator.ts
  persistent-session.ts
  human-in-the-loop.ts
  deep-agent.ts
  evaluation.ts
```

Los ejemplos deben ser pequeños y didácticos.

## API

Crear una API HTTP mínima para ejecutar agentes.

Por ejemplo:

```text
POST /agents/:agentName/run
POST /agents/:agentName/resume
GET  /runs/:runId
GET  /sessions/:sessionId
```

No necesito todavía una interfaz gráfica.

## Configuración

Usar variables de entorno para:

- provider API keys
- PostgreSQL
- Langfuse

Crear:

```text
.env.example
```

Nunca almacenar secrets en el repositorio.

## README

Crear un README detallado.

Debe explicar:

1. Qué es MiniAgents.
2. Arquitectura.
3. LangGraph vs Deep Agents.
4. Cómo funciona el agent loop.
5. State.
6. Tools.
7. Model providers.
8. Persistence.
9. Sessions.
10. Memory.
11. Subagents.
12. Langfuse.
13. Evaluations.
14. LLM-as-a-Judge.
15. Human-in-the-loop.
16. Cómo correr PostgreSQL.
17. Cómo ejecutar ejemplos.
18. Cómo correr tests.
19. Cómo ejecutar evals.

Agregar diagramas Mermaid.

## Documentación para estudiar

Esto es importante.

Además del README, crear:

```text
docs/
```

Con documentos didácticos separados:

```text
01-architecture.md
02-langgraph-runtime.md
03-agent-state.md
04-tools.md
05-model-providers.md
06-persistence.md
07-memory.md
08-subagents.md
09-deep-agents.md
10-observability.md
11-evaluations.md
12-human-in-the-loop.md
13-production-considerations.md
```

Cada documento debe explicar:

- qué problema resuelve
- cómo funciona
- dónde se implementa en el repositorio
- decisiones tomadas
- trade-offs
- qué archivos conviene leer
- ejercicios sugeridos para experimentar

El objetivo es que pueda usar el repositorio como material de estudio.

## Calidad del código

Quiero código de calidad de producción:

- strict TypeScript
- nombres claros
- funciones pequeñas
- interfaces simples
- errores tipados cuando tenga sentido
- documentación solo donde aporte valor
- evitar `any`
- evitar duplicación
- evitar dependencias innecesarias

## Forma de trabajo

Antes de implementar:

1. inspeccioná el repositorio;
2. verificá versiones actuales y APIs de LangChain, LangGraph, Deep Agents y Langfuse;
3. definí la arquitectura;
4. documentá las decisiones importantes;
5. implementá el sistema completo de forma incremental.

No te detengas a preguntarme por decisiones menores.

Elegí defaults razonables y documentalos.

No reduzcas el alcance a un MVP si eso elimina alguna de las áreas principales descritas en este documento.

Quiero que todas estas capacidades estén presentes en el repositorio para poder estudiarlas juntas.

Sin embargo, mantener cada capacidad desacoplada y claramente separada para que pueda comprenderla individualmente.

Priorizá:

1. claridad
2. corrección
3. capacidad didáctica
4. testabilidad
5. extensibilidad
6. observabilidad

sobre cantidad de código.

## Validación final

Antes de terminar:

- instalar dependencias
- ejecutar typecheck
- ejecutar lint
- ejecutar tests
- ejecutar evals
- ejecutar ejemplos que no requieran API keys reales
- verificar build
- corregir cualquier error encontrado

Finalmente entregame un informe con:

- arquitectura implementada
- estructura de carpetas
- decisiones técnicas principales
- cómo funciona el runtime LangGraph
- cómo funciona el runtime Deep Agents
- cómo funciona persistence
- cómo funcionan subagents
- cómo funciona Langfuse
- cómo funcionan las evals
- comandos principales
- cobertura de tests
- limitaciones conocidas
- puntos específicos del código que debería estudiar primero