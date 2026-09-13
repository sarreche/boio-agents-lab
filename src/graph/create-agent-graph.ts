import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool as createLangChainTool } from "@langchain/core/tools";
import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";

import type { AgentDefinition } from "../core/agent-definition.js";
import type { StructuredOutputSchema } from "../core/agent-runtime.js";
import { GraphConfigurationError } from "../core/errors.js";
import type { Tracer } from "../observability/tracer.js";
import {
  DELEGATE_AGENT_TOOL_NAME,
  delegationArgumentsSchema,
  type SubagentCoordinator,
} from "../subagents/coordinator.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createCallModelNode } from "./nodes/call-model.js";
import { createExecuteToolsNode } from "./nodes/execute-tools.js";
import { createDelegateAgentNode } from "./nodes/delegate-agent.js";
import { createFinalizeNode } from "./nodes/finalize.js";
import { createRecordStepLimitNode, recordProtocolErrorNode } from "./nodes/record-errors.js";
import { rejectToolsNode } from "./nodes/reject-tools.js";
import { createRequestApprovalNode } from "./nodes/request-approval.js";
import { routeAfterApproval, routeAfterModel, routeAfterTools } from "./routers.js";
import { AgentGraphState } from "./state.js";

export function getStructuredOutputToolName(agentName: string): string {
  return `${agentName.replaceAll("-", "_")}_output`;
}

/** Builds the complete, inspectable graph used by LangGraphRuntime. */
export function createAgentGraph<TOutput extends Record<string, unknown>>(options: {
  definition: AgentDefinition;
  outputSchema: StructuredOutputSchema<TOutput>;
  model: BaseChatModel;
  tools: ToolRegistry;
  modelRetryMaxAttempts: number;
  checkpointer?: BaseCheckpointSaver;
  now?: () => Date;
  subagents?: SubagentCoordinator;
  tracer?: Tracer;
}) {
  const structuredOutputToolName = getStructuredOutputToolName(options.definition.name);
  if (options.definition.tools.includes(structuredOutputToolName)) {
    throw new GraphConfigurationError(
      `Tool "${structuredOutputToolName}" collides with the reserved structured-output tool.`,
    );
  }
  if (options.definition.tools.includes(DELEGATE_AGENT_TOOL_NAME)) {
    throw new GraphConfigurationError(
      `Tool "${DELEGATE_AGENT_TOOL_NAME}" is reserved for subagent delegation.`,
    );
  }
  if (options.definition.subagents.length > 0 && options.subagents === undefined) {
    throw new GraphConfigurationError(
      `Agent "${options.definition.name}" declares subagents but no coordinator was configured.`,
    );
  }

  const authorizedTools = options.tools.toLangChainTools(options.definition.tools);
  const structuredOutputTool = createLangChainTool(
    () => "Structured output accepted; no further model call is required.",
    {
      name: structuredOutputToolName,
      description: "Return the final answer using the required structured schema.",
      schema: options.outputSchema,
    },
  );
  const delegationTool =
    options.definition.subagents.length === 0 || options.subagents === undefined
      ? undefined
      : createLangChainTool(() => "Delegation is executed by the explicit graph node.", {
          name: DELEGATE_AGENT_TOOL_NAME,
          description: `Delegate one isolated task to an authorized subagent. Available: ${options.subagents.describeAuthorized(options.definition.subagents)}`,
          schema: delegationArgumentsSchema,
        });
  const modelTools =
    delegationTool === undefined
      ? [...authorizedTools, structuredOutputTool]
      : [...authorizedTools, delegationTool, structuredOutputTool];

  const graph = new StateGraph(AgentGraphState)
    .addNode(
      "call-model",
      createCallModelNode({
        model: options.model,
        tools: modelTools,
        systemPrompt: options.definition.systemPrompt,
        tracer: options.tracer,
        modelName: options.definition.model.model,
        modelParameters: { temperature: options.definition.model.temperature },
      }),
      {
        retryPolicy: {
          maxAttempts: options.modelRetryMaxAttempts,
          initialInterval: 10,
          jitter: false,
        },
      },
    )
    .addNode(
      "execute-tools",
      createExecuteToolsNode({
        tools: options.tools,
        authorizedTools: options.definition.tools,
        tracer: options.tracer,
      }),
    )
    .addNode(
      "finalize",
      createFinalizeNode({ outputSchema: options.outputSchema, structuredOutputToolName }),
    )
    .addNode(
      "delegate-agent",
      options.subagents === undefined
        ? () => {
            throw new GraphConfigurationError("Subagent coordinator is unavailable.");
          }
        : createDelegateAgentNode({
            coordinator: options.subagents,
            parentDefinition: options.definition,
            tracer: options.tracer,
          }),
    )
    .addNode("request-approval", createRequestApprovalNode(options.now ?? (() => new Date())))
    .addNode("reject-tools", rejectToolsNode)
    .addNode("record-protocol-error", recordProtocolErrorNode)
    .addNode("record-step-limit", createRecordStepLimitNode(options.definition.maxSteps))
    .addEdge(START, "call-model")
    .addConditionalEdges(
      "call-model",
      (state) =>
        routeAfterModel(
          state,
          structuredOutputToolName,
          options.definition.approvalRequiredTools,
          delegationTool?.name,
        ),
      ["execute-tools", "request-approval", "delegate-agent", "finalize", "record-protocol-error"],
    )
    .addConditionalEdges("request-approval", routeAfterApproval, ["execute-tools", "reject-tools"])
    .addConditionalEdges(
      "delegate-agent",
      (state) => routeAfterTools(state, options.definition.maxSteps),
      ["call-model", "record-step-limit"],
    )
    .addConditionalEdges(
      "execute-tools",
      (state) => routeAfterTools(state, options.definition.maxSteps),
      ["call-model", "record-step-limit"],
    )
    .addConditionalEdges(
      "reject-tools",
      (state) => routeAfterTools(state, options.definition.maxSteps),
      ["call-model", "record-step-limit"],
    )
    .addEdge("finalize", END)
    .addEdge("record-protocol-error", END)
    .addEdge("record-step-limit", END);

  return options.checkpointer === undefined
    ? graph.compile()
    : graph.compile({ checkpointer: options.checkpointer });
}
