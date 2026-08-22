import { describe, expect, it } from 'vitest';
import { buildFileMentionRows, detectFileMention, filterFileMentionRows, joinWorkspacePath } from './file-mention';
import type { CodeProjectFileEntry } from '@/src/rpc/types';

describe('@ 提及触发检测', () => {
	it('行首与空格后的 @ 均触发，返回可删除的文档范围', () => {
		expect(detectFileMention('@src', '', 0, 4)).toEqual({ query: 'src', from: 0, to: 4 });
		// 看一下 @app.ts：@ 位于本地偏移 4，光标在块尾 11。
		expect(detectFileMention('看一下 @app.ts', '', 0, 11)).toEqual({ query: 'app.ts', from: 4, to: 11 });
	});

	it('中文正文后直接跟 @ 也可触发', () => {
		expect(detectFileMention('修复@登录', '', 0, 5)).toEqual({ query: '登录', from: 2, to: 5 });
	});

	it('邮箱等既有单词内部的 @ 不触发', () => {
		expect(detectFileMention('user@example.com', '', 0, 16)).toBeNull();
		expect(detectFileMention('a-b@x', '', 0, 5)).toBeNull();
		expect(detectFileMention('v1.2@x', '', 0, 6)).toBeNull();
	});

	it('@ 与光标之间出现空白时关闭', () => {
		expect(detectFileMention('@src app', '', 0, 8)).toBeNull();
		expect(detectFileMention('a @ b', '', 0, 5)).toBeNull();
	});

	it('光标移入词中间（后面不是块尾或空白）时关闭', () => {
		expect(detectFileMention('@sr', 'c', 0, 3)).toBeNull();
		// 光标后紧跟命令 token 等原子节点同样视为词未结束。
		expect(detectFileMention('@sr', '\uFFFC', 0, 3)).toBeNull();
	});

	it('命令 token 等原子节点以占位符对齐位置，token 后的 @ 仍触发', () => {
		// \uFFFC 占位 1 字符对齐 1 个文档位置：from 指向第二个字符的 @。
		expect(detectFileMention('\uFFFC@app', '', 0, 5)).toEqual({ query: 'app', from: 1, to: 5 });
	});

	it('query 可包含路径片段与中文字符', () => {
		expect(detectFileMention('@src/app', '', 0, 8)?.query).toBe('src/app');
		expect(detectFileMention('@组件', '', 0, 3)?.query).toBe('组件');
	});
});

describe('@ 提及候选过滤排序', () => {
	const entries: CodeProjectFileEntry[] = [
		{ path: 'src', name: 'src', kind: 'directory' },
		{ path: 'src/app.ts', name: 'app.ts', kind: 'file', updatedAt: 100 },
		{ path: 'src/components/Application.tsx', name: 'Application.tsx', kind: 'file', updatedAt: 300 },
		{ path: 'docs/app-notes.md', name: 'app-notes.md', kind: 'file', updatedAt: 200 },
		{ path: 'README.md', name: 'README.md', kind: 'file', updatedAt: 50 },
	];
	const rows = buildFileMentionRows(entries);

	it('目录不参与候选，文件全量进入搜索行', () => {
		expect(rows.map((row) => row.path)).not.toContain('src');
		expect(rows.length).toBe(4);
	});

	it('文件名前缀 > 文件名子串 > 路径子串', () => {
		const tierEntries: CodeProjectFileEntry[] = [
			{ path: 'src/notebook/index.ts', name: 'index.ts', kind: 'file' },
			{ path: 'src/app-notes.ts', name: 'app-notes.ts', kind: 'file' },
			{ path: 'notes.md', name: 'notes.md', kind: 'file' },
			{ path: 'other.ts', name: 'other.ts', kind: 'file' },
		];
		expect(filterFileMentionRows(buildFileMentionRows(tierEntries), 'note').map((row) => row.path))
			.toEqual(['notes.md', 'src/app-notes.ts', 'src/notebook/index.ts']);
	});

	it('同档命中按层级浅、路径短优先', () => {
		// app 对三个文件都是文件名前缀命中，排序退化为层级/路径长度比较。
		const paths = filterFileMentionRows(rows, 'app').map((row) => row.path);
		expect(paths).toEqual(['src/app.ts', 'docs/app-notes.md', 'src/components/Application.tsx']);
	});

	it('路径子串兜底命中', () => {
		expect(filterFileMentionRows(rows, 'docs/app').map((row) => row.path)).toEqual(['docs/app-notes.md']);
	});

	it('匹配大小写不敏感', () => {
		expect(filterFileMentionRows(rows, 'readme').map((row) => row.path)).toEqual(['README.md']);
	});

	it('空 query 按最近修改时间降序，便于引用刚改过的文件', () => {
		expect(filterFileMentionRows(rows, '').map((row) => row.path)[0]).toBe('src/components/Application.tsx');
	});

	it('结果按上限截断，渲染节点数与文件总量无关', () => {
		const many: CodeProjectFileEntry[] = Array.from({ length: 80 }, (_, i) => ({
			path: `src/f${i}.ts`,
			name: `f${i}.ts`,
			kind: 'file' as const,
		}));
		expect(filterFileMentionRows(buildFileMentionRows(many), 'f').length).toBe(30);
	});

	it('无命中返回空数组', () => {
		expect(filterFileMentionRows(rows, 'zzz')).toEqual([]);
	});
});

describe('工作空间路径拼接', () => {
	it('按工作空间平台选择分隔符', () => {
		expect(joinWorkspacePath('C:\\work\\proj', 'src/app.ts')).toBe('C:\\work\\proj\\src\\app.ts');
		expect(joinWorkspacePath('/home/u/proj/', 'src/app.ts')).toBe('/home/u/proj/src/app.ts');
	});
});
