# 01 — Arquitectura

## Problema

Un framework de agentes suele volverse difícil de estudiar por dos motivos opuestos: demasiadas decisiones quedan ocultas por el framework o la aplicación vuelve a implementar primitivas que LangGraph ya resuelve. MiniAgents separa contratos propios, orquestación explícita y adaptadores externos para conservar visibilidad sin duplicar el runtime.

## Diseño

`AgentDefinition` es dato serializable. Describe identidad, prompt versionado, modelo, tools permitidas y límites. `AgentRuntime` es el puerto que ejecuta esa definición. Los adapters son deliberadamente diferentes internamente:

- Direct Model realiza una llamada estructurada sin tool loop.
- Tool Calling delega el loop de referencia a `createAgent` de LangChain.
- LangGraph construye un `StateGraph` visible, con estado y routing propios.
- Deep Agents configura el harness y documenta las capacidades delegadas.

```mermaid
flowchart LR
    Agents[Agent definitions] --> Core[Core contracts]
    API[HTTP / examples] --> Core
    Core --> RuntimePort[AgentRuntime]
    RuntimePort --> DirectAdapter
    RuntimePort --> ToolCallingAdapter
    RuntimePort --> LangGraphAdapter
    RuntimePort --> DeepAgentsAdapter
    DirectAdapter --> Providers[Model registry]
    ToolCallingAdapter --> Providers
    ToolCallingAdapter --> Tools[Authorized tool registry]
    LangGraphAdapter --> Providers[Model registry]
    DeepAgentsAdapter --> Providers
    LangGraphAdapter --> Tools
    DeepAgentsAdapter --> Tools
    LangGraphAdapter --> Persistence
    LangGraphAdapter --> Delegation[Subagent coordinator]
    Delegation --> RuntimePort
    LangGraphAdapter --> Tracing[Tracer port]
    DeepAgentsAdapter --> Tracing
```

Las dependencias concretas se ensamblan en un composition root, no dentro de agentes ni contratos. Esto permite sustituir un provider, un tracer o un checkpointer en tests.

## Decisiones

- ESM y NodeNext para seguir el ecosistema actual de LangChain.
- Zod en todos los límites dinámicos: entorno, tools, structured output y datos persistidos.
- Identificadores separados para sesiones y runs.
- Tools deny-by-default y filesystem confinado a un root validado.
- Persistencia de checkpoints separada del almacenamiento de memoria de largo plazo.
- Trazas mediante una interfaz propia; Langfuse es un adapter opcional.

El puerto de observabilidad basado en callback ya está implementado. Ese scope conserva la jerarquía OpenTelemetry entre el run, sus generaciones, tools y children, mientras los adapters concretos permanecen fuera de `core`.

## Trade-offs

Los puertos propios agregan algo de código, pero aíslan infraestructura y facilitan fakes. No se crea una interfaz local para cada tipo externo: LangGraph permanece visible dentro de `src/graph`, donde esconderlo reduciría el valor pedagógico.

## Dónde mirar

Hoy: `src/core/agent-definition.ts`, `src/core/agent-runtime.ts`, `src/models/registry.ts`, `src/tools/registry.ts`, `src/graph/`, los tres archivos de `src/runtime/`, `src/agents/`, `src/subagents/`, `src/observability/`, `src/config/environment.ts`, `AGENTS.md` y las ADR. Los tres runtimes ofrecen referencias ejecutables con distintos niveles de abstracción; checkpoints, HITL, delegación y trazas ya son explícitos en `LangGraphRuntime`.

## Ejercicios

1. Añadir un campo serializable a `AgentDefinition` y observar qué tests/documentos deben cambiar.
2. Dibujar qué import sería inválido si `src/core` intentara crear un cliente OpenAI.
3. Explicar por qué un registry global complica tests paralelos.
