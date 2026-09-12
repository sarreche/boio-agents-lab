# AGENTS.md

## Project identity

- Repository: `boio-agents-lab`
- Library/course name: **MiniAgents**
- Purpose: a production-quality but deliberately readable TypeScript laboratory for studying modern agent engineering.
- Primary language for code and public API: English.
- Primary language for learning documentation: Spanish. Keep identifiers and canonical technical terms in English.

This repository values, in order: clarity, correctness, educational value, testability, extensibility, and observability. Do not trade explicit control flow for a clever abstraction.

## Before changing code

1. Read the relevant document under `docs/` and any ADR under `docs/adr/`.
2. Inspect nearby implementation and tests before proposing a new abstraction.
3. Verify current upstream APIs in official documentation when touching LangChain, LangGraph, Deep Agents, or Langfuse. Record meaningful compatibility decisions in an ADR.
4. Preserve the distinction between the explicit `LangGraphRuntime` and the higher-level `DeepAgentsRuntime`.

## Architecture boundaries

- `src/core`: provider- and runtime-neutral contracts. It must not import concrete providers, databases, HTTP frameworks, or Langfuse.
- `src/graph`: the explicit LangGraph state machine, nodes, edges, and routing decisions.
- `src/runtime`: adapters implementing the runtime contract.
- `src/models`: model-provider adapters and registry. Agents never instantiate provider SDKs directly.
- `src/tools`: schemas, execution contracts, authorization, and sandboxed built-ins.
- `src/agents`: declarative agent definitions; avoid infrastructure logic here.
- `src/subagents`: delegation policy, registry, depth limits, and structured hand-offs.
- `src/persistence`: checkpoints, sessions, and durable stores.
- `src/memory`: short- and long-term memory policies, separate from checkpoint persistence.
- `src/observability`: project-owned tracing interface and adapters.
- `src/evals`: datasets, evaluators, thresholds, and regression runner.
- `src/api`: the thin HTTP transport layer; domain behavior belongs elsewhere.
- `src/config`: environment parsing and composition roots only.

Dependencies point inward toward `core`. Cross-cutting adapters implement project-owned interfaces. Prefer composition over inheritance.

## Non-negotiable safety rules

- Never commit secrets or real credentials. Update `.env.example` with placeholders for every new variable.
- Never expose arbitrary shell execution as an agent tool.
- Every tool is deny-by-default: an agent may call only tools explicitly listed in its definition.
- File tools must resolve and validate paths inside their configured sandbox root before reading or writing.
- Validate model-produced tool arguments and structured output at runtime with Zod.
- Enforce max steps, model/tool timeouts, retry caps, and subagent depth in code, not only in prompts.
- Do not log secrets, full credentials, or sensitive model/tool payloads by default.

## TypeScript and code style

- Strict TypeScript; do not use `any`. Prefer `unknown` plus validation.
- ESM with NodeNext resolution. Include `.js` in relative import specifiers in TypeScript source.
- File names use `kebab-case.ts`; types/classes use `PascalCase`; functions/variables use `camelCase`; constants use `UPPER_SNAKE_CASE` only for true constants.
- Keep functions small and dependencies explicit. Avoid global registries except at the application composition root.
- Comments explain intent, invariants, protocol behavior, or non-obvious trade-offs. Do not narrate syntax.
- Public contracts and educationally important algorithms receive concise TSDoc.
- Typed domain errors should retain their `cause` when wrapping provider or infrastructure failures.

## State and runtime rules

- Agent state is explicit, serializable, and versioned when its persisted shape changes.
- LangGraph nodes return partial state updates and do not mutate input state.
- Routing functions are deterministic and side-effect free.
- Side effects occur in named nodes/services and are traced.
- A `sessionId` identifies conversational continuity; a `runId` identifies one execution attempt. Never conflate them.
- A child agent has its own run and trace. The parent stores a structured child-run reference/result.
- The Deep Agents adapter may use higher-level facilities, but document what it delegates to the framework.

## Testing and verification

Run the smallest relevant check while iterating, then before handing off run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run eval
npm run eval:regression
npm run build
```

Tests must not require network access, API keys, Langfuse, or an external database unless explicitly marked as opt-in integration tests. Use fake models, deterministic clocks, and in-memory persistence by default.

Every behavior change needs tests covering the successful path and the important boundary/failure path. Regression eval thresholds must cause a non-zero exit code when violated.

## Documentation discipline

- Update the matching numbered document in `docs/` with every architectural change.
- Add an ADR for decisions that affect dependencies, persisted state, public contracts, security boundaries, or runtime behavior.
- Each substantial document should cover: problem, operation, repository location, decisions, trade-offs, reading path, and suggested exercises.
- Mermaid diagrams must reflect the implementation, not an aspirational design without a status label.
- Keep README examples runnable and link deeper explanations instead of duplicating them.

## Git workflow

- Default branch: `main`.
- Branches: `feat/<short-kebab-name>`, `fix/<short-kebab-name>`, `docs/<short-kebab-name>`, `refactor/<short-kebab-name>`, `test/<short-kebab-name>`, or `chore/<short-kebab-name>`.
- Use Conventional Commits, for example `feat(runtime): add explicit tool routing`.
- Keep commits focused and include tests/docs with the change they describe.
- Do not push, create a GitHub repository, or open a pull request unless the user explicitly asks.
- Never rewrite shared history or discard uncommitted user work.

## Definition of done

A change is complete only when its code, tests, documentation, configuration examples, and relevant observability are consistent; the required checks pass; and known limitations are stated plainly.
