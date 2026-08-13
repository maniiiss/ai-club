/** GitPilot only needs the public extension factories; upstream packages ship TS source. */
declare module "pi-web-access" {
	import type { ExtensionFactory } from "../core/extensions/types.ts";
	const extension: ExtensionFactory;
	export default extension;
}

declare module "pi-mcp-adapter" {
	import type { ExtensionFactory } from "../core/extensions/types.ts";
	export function createMcpAdapter(options?: { config?: { mcpServers: Record<string, unknown>; settings?: Record<string, unknown> } }): ExtensionFactory;
	export const MCP_STATUS_EVENT: string;
}
