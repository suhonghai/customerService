/**
 * 把 MCP 工具和本地工具 merge 成一个 map,给 streamText({ tools }) 用。
 *
 * AI SDK 6.x 的 client.tools() 返回 { [name]: CoreTool } 结构,
 * 跟 W5-6 的本地工具(calc / get_weather / etc.)直接 spread 即可,
 * AI 看到的是统一 tools map,无差别处理。
 *
 * 注:值类型用 Record<string, unknown> 是因为 AI SDK 的 ToolSet 是泛型联合,
 * MCP 工具从 SDK 动态回来没法在编译期精确推断;反正 streamText 内部会 normalize。
 */
export async function mergeTools({
  mcpClient,
  localTools,
}: {
  mcpClient: { listTools: () => Promise<Record<string, unknown>> };
  localTools: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const mcpTools = await mcpClient.listTools();
  return {
    ...localTools,
    ...mcpTools,
  };
}
