import { useCallback, useEffect, useState } from 'react';
import { CirclePower, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { rpc } from '@/src/rpc/bridge';
import type { ManagedMcpServer, McpMode } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { Input } from '@/src/components/ui/input';

const modes: McpMode[] = ['code', 'work', 'design'];
type McpTransport = 'stdio' | 'http';

export interface McpDraft {
	name: string;
	transport: McpTransport;
	endpoint: string;
	modes: McpMode[];
}

export function validateMcpDraft(draft: McpDraft): string | null {
	if (!draft.name.trim()) return '请填写服务名';
	if (!/^[A-Za-z0-9_.-]+$/.test(draft.name.trim())) return '服务名只能包含字母、数字、点、下划线和短横线';
	if (!draft.endpoint.trim()) return draft.transport === 'stdio' ? '请填写 stdio command' : '请填写 HTTP URL';
	if (draft.modes.length === 0) return '请至少选择一个可用模式';
	return null;
}

export function canManageMcpServer(server: ManagedMcpServer): boolean {
	return server.source === 'global';
}

export function nextMcpModes(current: McpMode[], mode: McpMode, checked: boolean): McpMode[] {
	return checked ? [...new Set([...current, mode])] : current.filter((item) => item !== mode);
}

function sourceLabel(source: ManagedMcpServer['source']): string {
	if (source === 'project') return '项目配置';
	if (source === 'project-override') return '项目覆盖';
	return '全局配置';
}

/** MCP 分区只消费脱敏服务摘要；凭据字段不进入 React store。 */
export function McpSettingsPanel() {
	const [servers, setServers] = useState<ManagedMcpServer[]>([]);
	const [name, setName] = useState('');
	const [transport, setTransport] = useState<McpTransport>('stdio');
	const [endpoint, setEndpoint] = useState('');
	const [selectedModes, setSelectedModes] = useState<McpMode[]>(['code']);
	const [error, setError] = useState('');
	const refresh = useCallback(async () => {
		try {
			const result = await rpc.mcpList();
			if (result.success && result.command === 'mcp_list') setServers(result.data.servers);
			else setError(result.success ? '读取 MCP 服务失败' : result.error);
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}, []);
	useEffect(() => { void refresh(); }, [refresh]);
	const save = async () => {
		setError('');
		const draft = { name, transport, endpoint, modes: selectedModes } satisfies McpDraft;
		const validation = validateMcpDraft(draft);
		if (validation) { setError(validation); return; }
		const definition: Record<string, unknown> = transport === 'stdio' ? { command: endpoint.trim() } : { url: endpoint.trim() };
		try {
			const result = await rpc.mcpSaveServer(name.trim(), definition, selectedModes);
			if (!result.success) { setError(result.error); return; }
			setName(''); setEndpoint(''); setTransport('stdio'); setSelectedModes(['code']); await refresh();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	};
	const updateModes = async (server: ManagedMcpServer, next: McpMode[]) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpSetModes(server.name, next);
		if (!result.success) setError(result.error);
		else await refresh();
	};
	const setEnabled = async (server: ManagedMcpServer, enabled: boolean) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpSetEnabled(server.name, enabled);
		if (!result.success) setError(result.error);
		else await refresh();
	};
	const deleteServer = async (server: ManagedMcpServer) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpDeleteServer(server.name);
		if (!result.success) setError(result.error);
		else await refresh();
	};

	return <div className="flex min-h-0 flex-1 flex-col">
		<div className="border-b border-[var(--border)] px-5 py-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--foreground)]">MCP 服务</h3><Hint content="重新加载 MCP 服务"><Button type="button" variant="outline" size="icon-sm" onClick={() => void rpc.mcpReload().then(refresh)} aria-label="重新加载 MCP 服务"><RefreshCw /></Button></Hint></div></div>
		<div className="min-h-0 flex-1 overflow-y-auto"><div className="space-y-2 px-5 py-4">{servers.map((server) => {
			const manageable = canManageMcpServer(server);
			return <div key={server.name} className="border border-[var(--border)] bg-[var(--card)] p-3"><div className="flex min-w-0 items-center gap-3"><span className={`h-2 w-2 shrink-0 rounded-full ${server.enabled ? 'bg-[var(--gp-status-success)]' : 'bg-[var(--muted-foreground)]'}`} aria-hidden="true" /><div className="min-w-0 flex-1"><b className="block truncate text-xs text-[var(--foreground)]">{server.name}</b><span className="mt-1 block text-[10px] uppercase text-[var(--muted-foreground)]">{sourceLabel(server.source)} · {server.transport}</span></div><Hint content={manageable ? (server.enabled ? '停用服务' : '启用服务') : '项目来源服务只能查看'}><span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void setEnabled(server, !server.enabled)} disabled={!manageable} aria-label={server.enabled ? `停用 ${server.name}` : `启用 ${server.name}`}><CirclePower /></Button></span></Hint><Hint content={manageable ? '删除全局服务' : '项目来源服务不能删除'}><span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void deleteServer(server)} disabled={!manageable} aria-label={`删除 ${server.name}`}><Trash2 /></Button></span></Hint></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[var(--secondary-foreground)]">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={server.modes.includes(mode)} disabled={!manageable} onChange={(event) => void updateModes(server, nextMcpModes(server.modes, mode, event.target.checked))} />{mode.toUpperCase()}</label>)}</div></div>;
		})}{servers.length === 0 && <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">尚未配置 MCP 服务。</p>}</div>
			<div className="border-t border-[var(--border)] bg-[var(--secondary)]/40 px-5 py-4"><div className="mb-3 flex items-center justify-between"><b className="text-xs text-[var(--foreground)]">添加全局服务</b><div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5"><Button type="button" variant={transport === 'stdio' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTransport('stdio')}>Stdio</Button><Button type="button" variant={transport === 'http' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTransport('http')}>HTTP</Button></div></div><div className="grid gap-2 sm:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="服务名" aria-label="MCP 服务名" /><Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder={transport === 'stdio' ? 'stdio command' : 'HTTPS URL'} aria-label={transport === 'stdio' ? 'stdio command' : 'HTTP URL'} /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={selectedModes.includes(mode)} onChange={(event) => setSelectedModes((current) => nextMcpModes(current, mode, event.target.checked))} />{mode.toUpperCase()}</label>)}</div><Button type="button" size="sm" onClick={() => void save()}><Plus />添加服务</Button></div>{error && <p role="alert" className="mt-3 text-xs text-[var(--destructive)]">{error}</p>}</div>
		</div>
	</div>;
}
