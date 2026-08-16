import { describe, expect, it } from 'vitest';
import { canManageMcpServer, nextMcpModes, validateMcpDraft } from './McpManagerDialog';
import type { ManagedMcpServer } from '@/src/rpc/types';

const globalServer: ManagedMcpServer = { name: 'filesystem', source: 'global', enabled: true, modes: ['code'], transport: 'stdio' };

describe('MCP 设置分区', () => {
	it('校验服务名、连接地址与授权模式', () => {
		expect(validateMcpDraft({ name: '', transport: 'stdio', endpoint: 'npx @mcp/server', modes: ['code'] })).toBe('请填写服务名');
		expect(validateMcpDraft({ name: 'file system', transport: 'stdio', endpoint: 'npx @mcp/server', modes: ['code'] })).toContain('服务名只能包含');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'http', endpoint: '', modes: ['code'] })).toBe('请填写 HTTP URL');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'stdio', endpoint: 'npx @mcp/server', modes: [] })).toBe('请至少选择一个可用模式');
		expect(validateMcpDraft({ name: 'filesystem', transport: 'stdio', endpoint: 'npx @mcp/server', modes: ['code'] })).toBeNull();
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
});
