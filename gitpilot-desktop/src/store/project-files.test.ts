import { describe, expect, it } from 'vitest';
import { buildProjectFileTree, filterProjectFileTree } from './project-files';

describe('Code 项目文件树转换', () => {
	it('将 sidecar 扁平条目转换为目录优先的树', () => {
		const tree = buildProjectFileTree([
			{ path: 'src/z.ts', name: 'z.ts', kind: 'file' },
			{ path: 'README.md', name: 'README.md', kind: 'file' },
			{ path: 'src', name: 'src', kind: 'directory' },
			{ path: 'src/App.tsx', name: 'App.tsx', kind: 'file' },
		]);

		expect(tree.map((node) => node.path)).toEqual(['src', 'README.md']);
		expect(tree[0].children.map((node) => node.path)).toEqual(['src/App.tsx', 'src/z.ts']);
	});

	it('搜索命中时保留祖先目录和命中目录的上下文', () => {
		const tree = buildProjectFileTree([
			{ path: 'src', name: 'src', kind: 'directory' },
			{ path: 'src/components', name: 'components', kind: 'directory' },
			{ path: 'src/components/InputBox.tsx', name: 'InputBox.tsx', kind: 'file' },
			{ path: 'src/store/session.ts', name: 'session.ts', kind: 'file' },
			{ path: 'package.json', name: 'package.json', kind: 'file' },
		]);

		const filtered = filterProjectFileTree(tree, 'inputbox');

		expect(filtered.map((node) => node.path)).toEqual(['src']);
		expect(filtered[0].children.map((node) => node.path)).toEqual(['src/components']);
		expect(filtered[0].children[0].children.map((node) => node.path)).toEqual(['src/components/InputBox.tsx']);
	});
});
