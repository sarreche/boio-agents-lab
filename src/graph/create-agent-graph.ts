import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool as createLangChainTool } from "@langchain/core/tools";
import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";

import type { AgentDefinition } from "../core/agent-definition.js";
import type { StructuredOutputSchema } from "../core/agent-runtime.js";
import { GraphConfigurationError } from "../core/errors.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createCallModelNode } from "./nodes/call-model.js";
import { createExecuteToolsNode } from "./nodes/execute-tools.js";
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
}) {
  const structuredOutputToolName = getStructuredOutputToolName(options.definition.name);
  if (options.definition.tools.includes(structuredOutputToolName)) {
    throw new GraphConfigurationError(
      `Tool "${structuredOutputToolName}" collides with the reserved structured-output tool.`,
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

  const graph = new StateGraph(AgentGraphState)
    .addNode(
      "call-model",
      createCallModelNode({
        model: options.model,
        tools: [...authorizedTools, structuredOutputTool],
        systemPrompt: options.definition.systemPrompt,
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
      createExecuteToolsNode({ tools: options.tools, authorizedTools: options.definition.tools }),
    )
    .addNode(
      "finalize",
      createFinalizeNode({ outputSchema: options.outputSchema, structuredOutputToolName }),
    )
    .addNode("request-approval", createRequestApprovalNode(options.now ?? (() => new Date())))
    .addNode("reject-tools", rejectToolsNode)
    .addNode("record-protocol-error", recordProtocolErrorNode)
    .addNode("record-step-limit", createRecordStepLimitNode(options.definition.maxSteps))
    .addEdge(START, "call-model")
    .addConditionalEdges(
      "call-model",
      (state) =>
        routeAfterModel(state, structuredOutputToolName, options.definition.approvalRequiredTools),
      ["execute-tools", "request-approval", "finalize", "record-protocol-error"],
    )
    .addConditionalEdges("request-approval", routeAfterApproval, ["execute-tools", "reject-tools"])
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
