import { passthroughSchema } from "./schema.js";
import type { McpTool, Skill } from "./types.js";

export function mcpToolToSkill(tool: McpTool, namespace = "mcp"): Skill {
  const id = `${namespace}.${tool.name}`;
  const tags = new Set<string>(["io"]);

  if (tool.annotations?.destructiveHint === true) {
    tags.add("destructive");
  }

  if (tool.annotations?.readOnlyHint === true) {
    tags.add("search");
  }

  return {
    id,
    description: tool.description ?? `Invoke MCP tool ${tool.name}.`,
    inputSchema: tool.inputSchema ?? passthroughSchema,
    outputSchema: tool.outputSchema ?? passthroughSchema,
    tags: [...tags],
    cost: "external",
    execute: (input, ctx) => tool.call(input, ctx),
  };
}
