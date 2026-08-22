/**
 * @ 文件提及的纯逻辑层：触发检测、搜索行构建、过滤排序与路径拼接。
 *
 * 业务意图：CODE 模式输入框输入 @ 后弹出工作空间文件搜索面板，
 * 大仓库（code_file_list 上限 1 万条目）下过滤不得造成输入卡顿：
 * - 检测与过滤均为无副作用纯函数，便于单测与性能审计；
 * - 过滤只消费预计算的小写搜索行，键入时零字符串分配；
 * - 结果固定 top-N 截断，渲染节点数与文件总量无关。
 * 设计文档见 docs/design-docs/code-file-mention-technical-design-v1.md。
 */
import type { CodeProjectFileEntry } from '@/src/rpc/types';

/** 触发检测结果：from/to 为 ProseMirror 文档位置，选中后用它精确删除正文里的 @query 文本。 */
export interface FileMentionMatch {
	query: string;
	from: number;
	to: number;
}

/** 候选上限：与文件总量解耦，1 万条目下过滤约 1-2ms，无需虚拟列表。 */
export const FILE_MENTION_LIMIT = 30;

/**
 * 识别光标是否处于待完成的 @ 提及词尾。
 *
 * @param textBeforeCursor 当前文本块中光标前的纯文本；原子节点（命令 token/硬换行）应以 \uFFFC 占位，
 *   占位符 1 字符对齐 1 个文档位置，from = blockStart + 本地偏移 才成立。
 * @param textAfterCursor 光标后的下一个字符（空串表示块尾），用于判定光标是否位于词尾。
 * @param blockStart 当前文本块内容起点在文档中的位置。
 * @param cursorPos 光标在文档中的位置。
 */
export function detectFileMention(
	textBeforeCursor: string,
	textAfterCursor: string,
	blockStart: number,
	cursorPos: number,
): FileMentionMatch | null {
	// 光标必须位于词尾：后面是块尾或空白。光标移入词中间时关闭面板。
	if (textAfterCursor !== '' && !/^\s/.test(textAfterCursor)) return null;
	const trailing = textBeforeCursor.match(/@([^@\s]*)$/);
	if (!trailing) return null;
	const atOffset = textBeforeCursor.length - trailing[1].length - 1;
	// @ 前是字母/数字/下划线/点/横线时视为邮箱等既有单词内部，不触发；
	// 行首、空白、中文、命令 token（\uFFFC）后的 @ 均允许触发。
	const prev = atOffset > 0 ? textBeforeCursor[atOffset - 1] : '';
	if (/[A-Za-z0-9_.\-]/.test(prev)) return null;
	return { query: trailing[1], from: blockStart + atOffset, to: cursorPos };
}

/** 提及候选的预计算搜索行：小写化与层级只在 entries 变化时算一次。 */
export interface FileMentionRow {
	path: string;
	name: string;
	size?: number;
	updatedAt?: number;
	nameLower: string;
	pathLower: string;
	depth: number;
}

/** 只保留文件条目（目录无法走附件读取链路），并完成小写化与层级预计算。 */
export function buildFileMentionRows(entries: CodeProjectFileEntry[]): FileMentionRow[] {
	return entries
		.filter((entry) => entry.kind === 'file')
		.map((entry) => ({
			path: entry.path,
			name: entry.name,
			size: entry.size,
			updatedAt: entry.updatedAt,
			nameLower: entry.name.toLocaleLowerCase(),
			pathLower: entry.path.toLocaleLowerCase(),
			depth: entry.path.split('/').length - 1,
		}));
}

/**
 * 过滤并排序提及候选。
 * 排序规则：文件名前缀 > 文件名子串 > 路径子串；同级浅路径优先、路径短优先、localeCompare 收尾。
 * 空 query（刚输入 @）按最近修改时间降序，便于引用刚改过的文件。
 */
export function filterFileMentionRows(rows: FileMentionRow[], query: string, limit = FILE_MENTION_LIMIT): FileMentionRow[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) {
		return [...rows]
			.sort(
				(a, b) =>
					(b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
					a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
			)
			.slice(0, limit);
	}
	const scored: Array<{ row: FileMentionRow; score: number }> = [];
	for (const row of rows) {
		let score: number;
		if (row.nameLower.startsWith(needle)) score = 0;
		else if (row.nameLower.includes(needle)) score = 1;
		else if (row.pathLower.includes(needle)) score = 2;
		else continue;
		scored.push({ row, score });
	}
	scored.sort(
		(a, b) =>
			a.score - b.score ||
			a.row.depth - b.row.depth ||
			a.row.path.length - b.row.path.length ||
			a.row.path.localeCompare(b.row.path, undefined, { numeric: true, sensitivity: 'base' }),
	);
	return scored.slice(0, limit).map((item) => item.row);
}

/**
 * 将工作空间相对路径拼成本地绝对路径，分隔符跟随工作空间平台。
 * 与文件树"添加到对话框"（TargetProjectFilesPanel）同规则，保证附件去重键一致。
 */
export function joinWorkspacePath(workspacePath: string, relativePath: string): string {
	const separator = workspacePath.includes('\\') || /^[A-Za-z]:/.test(workspacePath) ? '\\' : '/';
	const base = workspacePath.replace(/[\\/]+$/, '');
	return `${base}${separator}${relativePath.replace(/\//g, separator)}`;
}
