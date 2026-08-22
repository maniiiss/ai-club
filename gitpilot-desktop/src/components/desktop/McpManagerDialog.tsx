import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise as RefreshCw, ArrowLeft, Copy, FloppyDisk as Save, PencilSimple as Pencil, Plus, Power as CirclePower, Trash as Trash2 } from '@phosphor-icons/react';
import { rpc } from '@/src/rpc/bridge';
import type { ManagedMcpServer, McpMode, McpServerDefinition, McpTransport } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Hint } from '@/src/components/ui/tooltip';
import { Input } from '@/src/components/ui/input';

const modes: McpMode[] = ['code', 'work', 'design'];
const DEFAULT_TIMEOUT = 30000;
type EditableTransport = Exclude<McpTransport, 'unknown'>;
type McpView = 'list' | 'editor';

/** 推荐服务的预设定义；用户点击添加后仍走全局服务保存链路，可继续编辑。 */
export interface McpPreset {
	name: string;
	title: string;
	description: string;
	/** macOS/Linux 的 stdio 启动命令。 */
	command: string;
	args: string[];
	/** Windows 下 npx 是 .cmd 脚本，不能被直接 spawn，需要经 cmd /c 启动。 */
	windowsCommand: string;
	windowsArgs: string[];
	modes: McpMode[];
	requestTimeoutMs: number;
}

/**
 * 官方推荐服务目录。GitNexus 与内置 gitnexus Skill 配套：
 * 需要本机 Node.js 20+，且在项目根目录运行 npx gitnexus analyze 建立索引。
 */
export const MCP_PRESETS: readonly McpPreset[] = [
	{
		name: 'gitnexus',
		title: 'GitNexus 代码知识图谱',
		description: '为 Code 模式提供代码理解、调用链与影响面分析，配套内置 gitnexus Skill。需本机 Node.js 20+，并在项目中运行 npx gitnexus analyze 建立索引。',
		command: 'npx',
		args: ['-y', 'gitnexus@latest', 'mcp'],
		windowsCommand: 'cmd',
		windowsArgs: ['/c', 'npx', '-y', 'gitnexus@latest', 'mcp'],
		modes: ['code'],
		requestTimeoutMs: 60000,
	},
];

/** 根据平台生成预设的标准 MCP 定义；Windows 必须经 cmd /c 启动 npx。 */
export function presetDefinition(preset: McpPreset, isWindows: boolean): McpServerDefinition {
	return {
		command: isWindows ? preset.windowsCommand : preset.command,
		args: isWindows ? [...preset.windowsArgs] : [...preset.args],
		requestTimeoutMs: preset.requestTimeoutMs,
	};
}

/** 从 userAgent 判断是否 Windows 平台，供预设选择启动命令。 */
export function detectWindowsPlatform(userAgent: string): boolean {
	return /Windows/i.test(userAgent);
}

/** 已存在同名服务（任意来源）的预设不再出现在推荐区，避免重复添加。 */
export function availableMcpPresets(presets: readonly McpPreset[], servers: readonly ManagedMcpServer[]): McpPreset[] {
	const existing = new Set(servers.map((server) => server.name));
	return presets.filter((preset) => !existing.has(preset.name));
}


export interface McpDraft {
	name: string;
	transport: EditableTransport;
	timeout: string;
	command: string;
	args: string;
	env: string;
	url: string;
	headers: string;
	modes: McpMode[];
	disabled?: boolean;
}

/** 解析图片表单中的空格参数，同时保留引号包裹的空格。 */
export function parseMcpArgs(value: string): string[] {
	const args: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let escaped = false;
	let tokenStarted = false;
	for (const char of value.trim()) {
		if (escaped) {
			// 双引号中只转义引号和反斜杠；其他反斜杠保持原样，兼容 Windows 路径。
			if (char !== '"' && char !== '\\') current += '\\';
			current += char;
			escaped = false;
			continue;
		}
		if (quote) {
			if (char === '\\' && quote === '"') { escaped = true; continue; }
			if (char === quote) quote = null;
			else current += char;
			tokenStarted = true;
		} else if (char === '"' || char === "'") { quote = char; tokenStarted = true; }
		else if (/\s/.test(char)) {
			if (tokenStarted) { args.push(current); current = ''; tokenStarted = false; }
		} else { current += char; tokenStarted = true; }
	}
	if (escaped) current += '\\';
	if (quote) throw new Error('参数引号未闭合');
	if (tokenStarted) args.push(current);
	return args;
}

export function parseMcpRecord(value: string, label: string): Record<string, string> | undefined {
	if (!value.trim()) return undefined;
	let parsed: unknown;
	try { parsed = JSON.parse(value); } catch { throw new Error(`${label}必须是有效 JSON`); }
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.entries(parsed).some(([key, item]) => !key.trim() || typeof item !== 'string')) throw new Error(`${label}必须是字符串键值对象`);
	return parsed as Record<string, string>;
}

function formatMcpArgs(args: string[] | undefined): string {
	return (args ?? []).map((arg) => /\s|["']/.test(arg) || arg.length === 0 ? `"${arg.replaceAll('"', '\\"')}"` : arg).join(' ');
}

export function definitionToDraftValues(name: string, definition: McpServerDefinition, modes: McpMode[], transportHint?: McpTransport): McpDraft {
	const transport: EditableTransport = transportHint && transportHint !== 'unknown' ? transportHint : definition.command ? 'stdio' : definition.httpTransport === 'sse' ? 'sse' : 'http';
	return {
		name,
		transport,
		timeout: String(definition.requestTimeoutMs ?? DEFAULT_TIMEOUT),
		command: definition.command ?? '',
		args: formatMcpArgs(definition.args),
		// 敏感值由调用方单独放入非响应式 ref，禁止进入 React state。
		env: '',
		url: definition.url ?? '',
		headers: '',
		modes,
		disabled: definition.disabled === true,
	};
}

export function definitionToDraft(server: ManagedMcpServer): McpDraft {
	return definitionToDraftValues(server.name, server.definition, server.modes, server.transport);
}

export function draftToDefinition(draft: McpDraft): McpServerDefinition {
	const timeout = Number(draft.timeout || DEFAULT_TIMEOUT);
	if (!Number.isInteger(timeout) || timeout <= 0) throw new Error('超时时间必须是正整数毫秒');
	const definition: McpServerDefinition = { requestTimeoutMs: timeout };
	if (draft.disabled !== undefined) definition.disabled = draft.disabled;
	if (draft.transport === 'stdio') {
		definition.command = draft.command.trim();
		if (!definition.command) throw new Error('请填写 stdio command');
		const args = parseMcpArgs(draft.args);
		if (args.length) definition.args = args;
		const env = parseMcpRecord(draft.env, '环境变量');
		if (env) definition.env = env;
	} else {
		definition.url = draft.url.trim();
		if (!definition.url) throw new Error('请填写 HTTP URL');
		definition.httpTransport = draft.transport === 'sse' ? 'sse' : 'streamable-http';
		const headers = parseMcpRecord(draft.headers, '请求头');
		if (headers) definition.headers = headers;
	}
	return definition;
}

/** 切换 JSON 编辑模式只生成可填写的模板，不应因为表单必填项为空而阻断用户切换。 */
export function draftToJsonDefinition(draft: McpDraft): McpServerDefinition {
	const timeout = Number(draft.timeout || DEFAULT_TIMEOUT);
	const definition: McpServerDefinition = { requestTimeoutMs: Number.isInteger(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT };
	if (draft.disabled !== undefined) definition.disabled = draft.disabled;
	if (draft.transport === 'stdio') {
		definition.command = draft.command.trim();
		try {
			const args = parseMcpArgs(draft.args);
			if (args.length) definition.args = args;
		} catch { /* 参数错误留给 JSON 编辑器或保存时提示，不能阻止切换编辑模式。 */ }
		try {
			const env = parseMcpRecord(draft.env, '环境变量');
			if (env) definition.env = env;
		} catch { /* 保留可编辑模板，避免切换模式被非关键字段拦截。 */ }
	} else {
		definition.url = draft.url.trim();
		definition.httpTransport = draft.transport === 'sse' ? 'sse' : 'streamable-http';
		try {
			const headers = parseMcpRecord(draft.headers, '请求头');
			if (headers) definition.headers = headers;
		} catch { /* 保留可编辑模板，避免切换模式被非关键字段拦截。 */ }
	}
	return definition;
}

export function validateMcpDraft(draft: McpDraft): string | null {
	const identityError = validateMcpIdentity(draft);
	if (identityError) return identityError;
	try { draftToDefinition(draft); return null; } catch (reason) { return reason instanceof Error ? reason.message : String(reason); }
}

function validateMcpIdentity(draft: McpDraft): string | null {
	if (!draft.name.trim()) return '请填写服务名';
	if (!/^[A-Za-z0-9_.-]+$/.test(draft.name.trim())) return '服务名只能包含字母、数字、点、下划线和短横线';
	if (draft.modes.length === 0) return '请至少选择一个可用模式';
	return null;
}

/** JSON 编辑器只允许一个标准服务定义对象，实际字段规范化仍由 sidecar 统一完成。 */
export function parseMcpDefinition(value: string): McpServerDefinition {
	let parsed: unknown;
	try { parsed = JSON.parse(value); } catch { throw new Error('JSON 必须是有效 JSON'); }
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 必须是 MCP 服务定义对象');
	return parsed as McpServerDefinition;
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

function transportLabel(transport: ManagedMcpServer['transport']): string {
	if (transport === 'stdio') return 'stdio';
	if (transport === 'sse') return 'SSE';
	if (transport === 'http') return 'HTTP';
	return '未知';
}

function blankDraft(): McpDraft {
	return { name: '', transport: 'stdio', timeout: String(DEFAULT_TIMEOUT), command: '', args: '', env: '', url: '', headers: '', modes: ['code'] };
}

function definitionText(definition: McpServerDefinition): string {
	return JSON.stringify(definition, null, 2);
}

/** MCP 设置只接收脱敏定义；未修改的凭据由 sidecar 在保存时恢复。 */
export function McpSettingsPanel() {
	const [servers, setServers] = useState<ManagedMcpServer[]>([]);
	const [view, setView] = useState<McpView>('list');
	const [draft, setDraft] = useState<McpDraft>(blankDraft);
	const [jsonMode, setJsonMode] = useState(false);
	const [editingName, setEditingName] = useState<string>();
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [sensitiveInputRevision, setSensitiveInputRevision] = useState(0);
	// 凭据和 JSON 编辑内容只放在 DOM/ref 中，不进入 React state 或列表响应。
	const sensitiveInputs = useRef({ env: '', headers: '' });
	const jsonDefinition = useRef('{}');
	const refresh = useCallback(async () => {
		try {
			const result = await rpc.mcpList();
			if (result.success && result.command === 'mcp_list') setServers(result.data.servers);
			else setError(result.success ? '读取 MCP 服务失败' : result.error);
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}, []);
	useEffect(() => { void refresh(); }, [refresh]);
	const editingServer = useMemo(() => editingName ? servers.find((server) => server.name === editingName) : undefined, [editingName, servers]);
	const updateDraft = (patch: Partial<McpDraft>) => setDraft((current) => ({ ...current, ...patch }));
	const syncSensitiveInputs = (definition: McpServerDefinition) => {
		sensitiveInputs.current = {
			env: definition.env ? JSON.stringify(definition.env, null, 2) : '',
			headers: definition.headers ? JSON.stringify(definition.headers, null, 2) : '',
		};
		setSensitiveInputRevision((current) => current + 1);
	};
	const draftWithSensitiveInputs = (): McpDraft => ({ ...draft, env: sensitiveInputs.current.env, headers: sensitiveInputs.current.headers });
	const resetEditor = () => { setEditingName(undefined); setDraft(blankDraft()); syncSensitiveInputs({}); jsonDefinition.current = '{}'; setJsonMode(false); };
	// 列表和编辑页共享同一份草稿；进入编辑页时才初始化，避免列表页被大量表单占满。
	const startCreate = () => { resetEditor(); setError(''); setView('editor'); };
	const startEdit = (server: ManagedMcpServer) => { setEditingName(server.name); setDraft(definitionToDraft(server)); syncSensitiveInputs(server.definition); jsonDefinition.current = definitionText(server.definition); setJsonMode(false); setError(''); setView('editor'); };
	const backToList = () => { resetEditor(); setError(''); setView('list'); };
	const save = async () => {
		setError('');
		const formDraft = draftWithSensitiveInputs();
		const identityError = validateMcpIdentity(formDraft);
		if (identityError) { setError(identityError); return; }
		const validation = validateMcpDraft(formDraft);
		if (validation && !jsonMode) { setError(validation); return; }
		let definition: McpServerDefinition;
		try {
			definition = jsonMode ? parseMcpDefinition(jsonDefinition.current) : draftToDefinition(formDraft);
			// 空白的敏感字段表示用户明确删除；字段省略仍保留给旧客户端的兼容语义。
			if (editingServer) {
				if (!jsonMode && editingServer.definition.env && !formDraft.env.trim()) definition.env = {};
				if (!jsonMode && editingServer.definition.headers && !formDraft.headers.trim()) definition.headers = {};
				if (jsonMode && editingServer.definition.env && !Object.hasOwn(definition, 'env')) definition.env = {};
				if (jsonMode && editingServer.definition.headers && !Object.hasOwn(definition, 'headers')) definition.headers = {};
				// 切换传输协议时，隐藏的另一类凭据不再适用于新连接，必须显式清理。
				if (definition.command && editingServer.definition.url) definition.headers = {};
				if (definition.url && editingServer.definition.command) definition.env = {};
			}
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return; }
		try {
			setBusy(true);
			const result = await rpc.mcpSaveServer(draft.name.trim(), definition, draft.modes, editingName);
			if (!result.success) { setError(result.error); return; }
			resetEditor(); setView('list'); await refresh();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setBusy(false); }
	};
	const updateModes = async (server: ManagedMcpServer, next: McpMode[]) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpSetModes(server.name, next);
		if (!result.success) setError(result.error); else await refresh();
	};
	const setEnabled = async (server: ManagedMcpServer, enabled: boolean) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpSetEnabled(server.name, enabled);
		if (!result.success) setError(result.error); else await refresh();
	};
	const deleteServer = async (server: ManagedMcpServer) => {
		if (!canManageMcpServer(server)) return;
		const result = await rpc.mcpDeleteServer(server.name);
		if (!result.success) setError(result.error); else { if (editingName === server.name) backToList(); await refresh(); }
	};
	const copyServer = async (server: ManagedMcpServer) => {
		const result = await rpc.mcpCopyServer(server.name);
		if (!result.success) setError(result.error); else await refresh();
	};
	// 一键添加推荐服务：直接写入全局 mcp.json，保存后仍可在列表中编辑。
	const addPreset = async (preset: McpPreset) => {
		setError('');
		try {
			setBusy(true);
			const result = await rpc.mcpSaveServer(preset.name, presetDefinition(preset, detectWindowsPlatform(navigator.userAgent)), preset.modes);
			if (!result.success) { setError(result.error); return; }
			await refresh();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setBusy(false); }
	};
	const toggleJsonMode = (next: boolean) => {
		if (next) {
			jsonDefinition.current = definitionText(draftToJsonDefinition(draftWithSensitiveInputs()));
		} else {
			try {
				const definition = parseMcpDefinition(jsonDefinition.current);
				syncSensitiveInputs(definition);
				setDraft(definitionToDraftValues(draft.name, definition, draft.modes));
			} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return; }
		}
		setJsonMode(next); setError('');
	};
	const fieldClass = 'rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-[length:var(--text-xs)] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]';
	const modeSelector = <div className="flex flex-wrap gap-x-4 gap-y-2 text-[length:var(--text-[length:var(--text-xs)])]">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1.5"><Checkbox checked={draft.modes.includes(mode)} onChange={(event) => updateDraft({ modes: nextMcpModes(draft.modes, mode, event.target.checked) })} />{mode.toUpperCase()}</label>)}</div>;
	const fields = draft.transport === 'stdio' ? <>
		<label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)]">命令<Input value={draft.command} onChange={(event) => updateDraft({ command: event.target.value })} placeholder="npx" /></label>
		<label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)]">参数（空格分隔）<Input value={draft.args} onChange={(event) => updateDraft({ args: event.target.value })} placeholder="-y @modelcontextprotocol/server-memory" /></label>
		<label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)] sm:col-span-2">环境变量（可选 JSON）<textarea key={`env-${editingName ?? 'new'}-${sensitiveInputRevision}`} className={fieldClass} rows={4} defaultValue={sensitiveInputs.current.env} onChange={(event) => { sensitiveInputs.current.env = event.target.value; }} placeholder={'{\n  "MY_API_KEY": "your-key"\n}'} /></label>
	</> : <>
		<label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)] sm:col-span-2">URL<textarea className={`${fieldClass} resize-y`} rows={1} value={draft.url} onChange={(event) => updateDraft({ url: event.target.value })} placeholder="https://mcp.example.com/mcp" /></label>
		<label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)] sm:col-span-2">请求头（可选 JSON）<textarea key={`headers-${editingName ?? 'new'}-${sensitiveInputRevision}`} className={fieldClass} rows={4} defaultValue={sensitiveInputs.current.headers} onChange={(event) => { sensitiveInputs.current.headers = event.target.value; }} placeholder={'{\n  "Authorization": "Bearer your-token"\n}'} /></label>
	</>;

	if (view === 'list') {
		const presets = availableMcpPresets(MCP_PRESETS, servers);
		return <div className="flex min-h-0 flex-1 flex-col">
			<div className="border-b border-[var(--border)] px-5 py-3"><div className="flex items-center justify-between gap-3"><h3 className="text-[length:var(--text-xs)] font-normal text-[var(--foreground)]">MCP 服务</h3><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={startCreate}><Plus />新建</Button><Hint content="重新加载 MCP 服务"><Button type="button" variant="outline" size="icon-sm" onClick={() => void rpc.mcpReload().then(refresh)} aria-label="重新加载 MCP 服务"><RefreshCw /></Button></Hint></div></div></div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{error && <p role="alert" className="mb-3 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--destructive)]">{error}</p>}{presets.length > 0 && <div className="mb-4"><p className="mb-2 text-[length:var(--text-[length:var(--text-xs)])] font-normal text-[var(--secondary-foreground)]">推荐服务</p><div className="space-y-2">{presets.map((preset) => {
				const commandPreview = detectWindowsPlatform(navigator.userAgent) ? `${preset.windowsCommand} ${preset.windowsArgs.join(' ')}` : `${preset.command} ${preset.args.join(' ')}`;
				return <div key={preset.name} className="border border-dashed border-[var(--border)] bg-[var(--card)] p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><span className="block truncate text-[length:var(--text-[length:var(--text-xs)])] text-[var(--foreground)]">{preset.title}</span><p className="mt-1 text-[length:var(--text-[length:var(--text-xs)])] leading-relaxed text-[var(--muted-foreground)]">{preset.description}</p><code className="mt-1 block truncate font-mono text-[length:var(--text-[length:var(--text-xs)])] text-[var(--muted-foreground)]">{commandPreview}</code></div><Button type="button" variant="outline" size="sm" onClick={() => void addPreset(preset)} disabled={busy}>添加</Button></div></div>;
			})}</div></div>}<div className="space-y-2">{servers.map((server) => {
				const manageable = canManageMcpServer(server);
				return <div key={server.name} className="border border-[var(--border)] bg-[var(--card)] p-3"><div className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${server.enabled ? 'bg-[var(--gp-status-success)]' : 'bg-[var(--muted-foreground)]'}`} aria-hidden="true" /><div className="min-w-0 flex-1"><span className="block truncate text-[length:var(--text-[length:var(--text-xs)])] text-[var(--foreground)]">{server.name}</span><span className="mt-1 block text-[length:var(--text-[length:var(--text-xs)])] uppercase text-[var(--muted-foreground)]">{sourceLabel(server.source)} · {transportLabel(server.transport)} · {server.definition.requestTimeoutMs ?? DEFAULT_TIMEOUT}ms</span></div>{manageable ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => startEdit(server)} aria-label={`编辑 ${server.name}`}><Pencil /></Button> : <Button type="button" variant="ghost" size="sm" onClick={() => void copyServer(server)}><Copy />复制到全局</Button>}<Hint content={manageable ? (server.enabled ? '停用服务' : '启用服务') : '项目来源服务只能查看'}><span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void setEnabled(server, !server.enabled)} disabled={!manageable} aria-label={server.enabled ? `停用 ${server.name}` : `启用 ${server.name}`}><CirclePower /></Button></span></Hint><Hint content={manageable ? '删除全局服务' : '项目来源服务不能删除'}><span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void deleteServer(server)} disabled={!manageable} aria-label={`删除 ${server.name}`}><Trash2 /></Button></span></Hint></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)]">{modes.map((mode) => <label key={mode} className="flex cursor-pointer items-center gap-1.5"><Checkbox checked={server.modes.includes(mode)} disabled={!manageable} onChange={(event) => void updateModes(server, nextMcpModes(server.modes, mode, event.target.checked))} />{mode.toUpperCase()}</label>)}</div></div>;
			})}{servers.length === 0 && <p className="py-8 text-center text-[length:var(--text-[length:var(--text-xs)])] text-[var(--muted-foreground)]">尚未配置 MCP 服务。</p>}</div></div>
		</div>;
	}

	return <div className="flex min-h-0 flex-1 flex-col">
		<div className="border-b border-[var(--border)] px-5 py-3"><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={backToList} aria-label="返回 MCP 服务列表" title="返回 MCP 服务列表"><ArrowLeft />返回</Button><div className="min-w-0 flex-1"><h3 className="truncate text-[length:var(--text-xs)] font-normal text-[var(--foreground)]">{editingServer ? `编辑 ${editingServer.name}` : '新建全局服务'}</h3></div><Button type="button" size="sm" onClick={() => void save()} disabled={busy}>{busy ? '保存中…' : <><Save />保存</>}</Button></div></div>
		<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4"><div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="mb-1 block text-[length:var(--text-[length:var(--text-xs)])] font-normal text-[var(--secondary-foreground)]">传输类型</span><div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5"><Button type="button" variant={draft.transport === 'stdio' ? 'secondary' : 'ghost'} size="sm" onClick={() => updateDraft({ transport: 'stdio' })}>stdio</Button><Button type="button" variant={draft.transport === 'http' ? 'secondary' : 'ghost'} size="sm" onClick={() => updateDraft({ transport: 'http' })}>HTTP</Button><Button type="button" variant={draft.transport === 'sse' ? 'secondary' : 'ghost'} size="sm" onClick={() => updateDraft({ transport: 'sse' })}>SSE</Button></div></div><div><span className="mb-1 block text-[length:var(--text-[length:var(--text-xs)])] font-normal text-[var(--secondary-foreground)]">编辑模式</span><div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5"><Button type="button" variant={!jsonMode ? 'secondary' : 'ghost'} size="sm" onClick={() => toggleJsonMode(false)}>表单</Button><Button type="button" variant={jsonMode ? 'secondary' : 'ghost'} size="sm" onClick={() => toggleJsonMode(true)}>JSON</Button></div></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)]">名称<Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="my-mcp-server" aria-label="MCP 服务名" /></label><label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)]">超时时间 MS<Input type="number" value={draft.timeout} onChange={(event) => updateDraft({ timeout: event.target.value })} placeholder={String(DEFAULT_TIMEOUT)} /></label>{jsonMode ? <label className="grid gap-1 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--secondary-foreground)] sm:col-span-2">MCP 服务定义<textarea className={`${fieldClass} min-h-48 font-mono`} defaultValue={jsonDefinition.current} onChange={(event) => { jsonDefinition.current = event.target.value; }} spellCheck={false} /></label> : fields}</div><div className="border-t border-[var(--border)] pt-4"><span className="mb-2 block text-[length:var(--text-[length:var(--text-xs)])] font-normal text-[var(--secondary-foreground)]">作用域</span>{modeSelector}</div>{error && <p role="alert" className="text-[length:var(--text-[length:var(--text-xs)])] text-[var(--destructive)]">{error}</p>}<p className="text-[length:var(--text-[length:var(--text-xs)])] text-[var(--muted-foreground)]">环境变量和请求头只显示脱敏占位符；未修改的凭据由 sidecar 保留。</p></div></div>
	</div>;
}
