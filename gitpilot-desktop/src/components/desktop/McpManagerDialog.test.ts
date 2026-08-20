import { describe, expect, it } from 'vitest';
import { availableMcpPresets, canManageMcpServer, definitionToDraft, detectWindowsPlatform, draftToDefinition, draftToJsonDefinition, MCP_PRESETS, nextMcpModes, parseMcpArgs, parseMcpDefinition, parseMcpRecord, presetDefinition, validateMcpDraft } from './McpManagerDialog';
import type { ManagedMcpServer } from '@/src/rpc/types';

const globalServer: ManagedMcpServer = { name: 'filesystem', source: 'global', enabled: true, modes: ['code'], transport: 'stdio', definition: { command: 'npx', args: ['@mcp/server'], requestTimeoutMs: 30000 } };

describe('MCP 设置分区', () => {
	it('校验服务名、连接地址与授权模式', () => {
		expect(validateMcpDraft({ name: '', transport: 'stdio', timeout: '30000', command: 'npx', args: '', env: '', url: '', headers: '', modes: ['code'] })).toBe('请填写服务名');
		expect(validateMcpDraft({ name: 'file system', transport: 'stdio', timeout: '30000', command: 'npx', args: '', env: '', url: '', headers: '', modes: ['code'] })).toContain('服务名只能包含');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'http', timeout: '30000', command: '', args: '', env: '', url: '', headers: '', modes: ['code'] })).toBe('请填写 HTTP URL');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'stdio', timeout: '30000', command: 'npx', args: '', env: '', url: '', headers: '', modes: [] })).toBe('请至少选择一个可用模式');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'stdio', timeout: '30000', command: 'npx', args: '@mcp/server', env: '', url: '', headers: '', modes: ['code'] })).toBeNull();
	});

	it('转换 stdio、HTTP 和 SSE 定义并解析带引号参数', () => {
		expect(parseMcpArgs('-y "@scope/server with space" --flag')).toEqual(['-y', '@scope/server with space', '--flag']);
		expect(parseMcpArgs('"C:\\Program Files\\server.js" ""')).toEqual(['C:\\Program Files\\server.js', '']);
		expect(parseMcpRecord('{"Authorization":"Bearer token"}', '请求头')).toEqual({ Authorization: 'Bearer token' });
		expect(draftToDefinition({ name: 'stdio', transport: 'stdio', timeout: '1200', command: 'npx', args: '-y server', env: '{"TOKEN":"secret"}', url: '', headers: '', modes: ['code'] })).toEqual({ requestTimeoutMs: 1200, command: 'npx', args: ['-y', 'server'], env: { TOKEN: 'secret' } });
		expect(draftToDefinition({ name: 'http', transport: 'http', timeout: '30000', command: '', args: '', env: '', url: 'https://example.com/mcp', headers: '', modes: ['work'] })).toMatchObject({ url: 'https://example.com/mcp', httpTransport: 'streamable-http' });
		expect(draftToDefinition({ name: 'sse', transport: 'sse', timeout: '30000', command: '', args: '', env: '', url: 'https://example.com/sse', headers: '{}', modes: ['design'] })).toMatchObject({ url: 'https://example.com/sse', httpTransport: 'sse' });
	});

	it('空表单切换 JSON 时生成可继续填写的模板，不触发必填校验', () => {
		expect(draftToJsonDefinition({ name: '', transport: 'stdio', timeout: '30000', command: '', args: '', env: '', url: '', headers: '', modes: ['code'] })).toEqual({ requestTimeoutMs: 30000, command: '' });
		expect(draftToJsonDefinition({ name: '', transport: 'sse', timeout: '', command: '', args: '', env: '', url: '', headers: '', modes: ['code'] })).toMatchObject({ requestTimeoutMs: 30000, url: '', httpTransport: 'sse' });
	});

	it('全局来源可管理，项目来源只读', () => {
		expect(canManageMcpServer(globalServer)).toBe(true);
		expect(canManageMcpServer({ ...globalServer, source: 'project' })).toBe(false);
		expect(canManageMcpServer({ ...globalServer, source: 'project-override' })).toBe(false);
	});

	it('模式调整不重复写入且可撤销单个授权', () => {
		expect(nextMcpModes(['code'], 'work', true)).toEqual(['code', 'work']);
		expect(nextMcpModes(['code', 'work'], 'work', true)).toEqual(['code', 'work']);
		expect(nextMcpModes(['code', 'work'], 'code', false)).toEqual(['work']);
	});

	it('JSON 定义校验和表单回显保留带空格参数', () => {
		expect(parseMcpDefinition('{"url":"https://example.com/mcp","httpTransport":"streamable-http"}')).toMatchObject({ url: 'https://example.com/mcp' });
		expect(() => parseMcpDefinition('{broken')).toThrow('有效 JSON');
		expect(() => parseMcpDefinition('[]')).toThrow('服务定义对象');
		expect(definitionToDraft({ ...globalServer, definition: { command: 'node', args: ['server.js', '--name', 'hello world'], requestTimeoutMs: 30000 } }).args).toBe('server.js --name "hello world"');
		expect(definitionToDraft({ ...globalServer, definition: { command: 'node', args: ['C:\\Program Files\\server.js', ''], requestTimeoutMs: 30000 } }).args).toBe('"C:\\Program Files\\server.js" ""');
	});

	it('推荐预设按平台生成定义，Windows 经 cmd /c 启动 npx', () => {
		const preset = MCP_PRESETS.find((item) => item.name === 'gitnexus');
		expect(preset).toBeDefined();
		if (!preset) return;
		// macOS/Linux 直接 spawn npx。
		expect(presetDefinition(preset, false)).toEqual({ command: 'npx', args: ['-y', 'gitnexus@latest', 'mcp'], requestTimeoutMs: preset.requestTimeoutMs });
		// Windows 上 npx 是 .cmd 脚本，必须经 cmd /c 才能被 spawn。
		expect(presetDefinition(preset, true)).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'gitnexus@latest', 'mcp'], requestTimeoutMs: preset.requestTimeoutMs });
		// 预设生成的是标准 stdio 定义，能通过现有草稿校验。
		expect(draftToDefinition({ name: preset.name, transport: 'stdio', timeout: String(preset.requestTimeoutMs), command: 'npx', args: '-y gitnexus@latest mcp', env: '', url: '', headers: '', modes: [...preset.modes] })).toEqual(presetDefinition(preset, false));
	});

	it('已存在同名服务时预设从推荐区隐藏', () => {
		expect(availableMcpPresets(MCP_PRESETS, []).map((preset) => preset.name)).toContain('gitnexus');
		expect(availableMcpPresets(MCP_PRESETS, [{ ...globalServer, name: 'gitnexus' }])).toEqual([]);
		// 项目来源的同名服务同样视为已存在，避免一键添加后被项目配置覆盖。
		expect(availableMcpPresets(MCP_PRESETS, [{ ...globalServer, name: 'gitnexus', source: 'project' }])).toEqual([]);
	});

	it('从 userAgent 识别 Windows 平台', () => {
		expect(detectWindowsPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(true);
		expect(detectWindowsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe(false);
		expect(detectWindowsPlatform('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe(false);
	});
});
