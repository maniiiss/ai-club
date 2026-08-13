import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { rpc } from '@/src/rpc/bridge';
import type { ManagedMcpServer, McpMode } from '@/src/rpc/types';
import { useMcpDialogStore } from '@/src/store/mcp';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';

const modes: McpMode[] = ['code', 'work', 'design'];

/** 凭据字段不进入 store；输入仅在本组件提交给 sidecar 后立即清空。 */
export function McpManagerDialog() {
	const open = useMcpDialogStore((s) => s.open);
	const hide = useMcpDialogStore((s) => s.hide);
	const [servers, setServers] = useState<ManagedMcpServer[]>([]);
	const [name, setName] = useState('');
	const [command, setCommand] = useState('');
	const [url, setUrl] = useState('');
	const [selectedModes, setSelectedModes] = useState<McpMode[]>(['code']);
	const [error, setError] = useState('');
	const refresh = async () => {
		try {
			const result = await rpc.mcpList();
			if (result.success && result.command === 'mcp_list') setServers(result.data.servers);
			else setError(result.success ? '读取 MCP 服务失败' : result.error);
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	};
	useEffect(() => { if (open) void refresh(); }, [open]);
	const save = async () => {
		setError('');
		if (!name.trim() || (!command.trim() && !url.trim())) { setError('请填写服务名及 command 或 URL'); return; }
		const definition: Record<string, unknown> = command.trim() ? { command: command.trim() } : { url: url.trim() };
		try {
			const result = await rpc.mcpSaveServer(name.trim(), definition, selectedModes);
			if (!result.success) { setError(result.error); return; }
			setName(''); setCommand(''); setUrl(''); setSelectedModes(['code']); await refresh();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	};
	const updateModes = async (server: ManagedMcpServer, next: McpMode[]) => { const result = await rpc.mcpSetModes(server.name, next); if (!result.success) setError(result.error); else await refresh(); };
	return <Dialog open={open} onOpenChange={(next) => { if (!next) hide(); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>MCP 管理</DialogTitle><DialogDescription>服务定义遵循标准 MCP 配置；各模式授权单独保存，凭据不会返回到桌面端。</DialogDescription></DialogHeader>
		<div className="max-h-[42vh] space-y-2 overflow-auto px-5 py-3">{servers.map((server) => <div key={server.name} className="rounded border border-[var(--border)] p-3 text-xs"><div className="flex items-center justify-between gap-3"><b>{server.name}</b><span>{server.source} · {server.transport} · {server.enabled ? '已启用' : '已停用'}</span><Button variant="ghost" size="icon-sm" title="删除" onClick={() => void rpc.mcpDeleteServer(server.name).then(refresh)}><Trash2 size={14} /></Button></div><div className="mt-2 flex gap-3">{modes.map((mode) => <label key={mode} className="flex items-center gap-1"><input type="checkbox" checked={server.modes.includes(mode)} onChange={(event) => void updateModes(server, event.target.checked ? [...server.modes, mode] : server.modes.filter((item) => item !== mode))} />{mode.toUpperCase()}</label>)}</div></div>)}{servers.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">尚未配置 MCP 服务。</p>}</div>
		<div className="space-y-2 border-t border-[var(--border)] px-5 py-3"><b className="text-xs">添加全局服务</b><div className="grid grid-cols-3 gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="服务名" /><Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="stdio command" /><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="或 HTTP URL" /></div><div className="flex gap-3 text-xs">{modes.map((mode) => <label key={mode} className="flex items-center gap-1"><input type="checkbox" checked={selectedModes.includes(mode)} onChange={(e) => setSelectedModes(e.target.checked ? [...selectedModes, mode] : selectedModes.filter((item) => item !== mode))} />{mode.toUpperCase()}</label>)}</div>{error && <p className="text-xs text-red-400">{error}</p>}</div>
		<DialogFooter><Button variant="outline" size="sm" onClick={() => void rpc.mcpReload().then(refresh)}><RefreshCw />重载</Button><Button size="sm" onClick={() => void save()}><Plus />添加服务</Button></DialogFooter>
	</DialogContent></Dialog>;
}
