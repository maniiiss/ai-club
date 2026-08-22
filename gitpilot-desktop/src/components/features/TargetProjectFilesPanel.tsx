import { ArrowClockwise, CaretRight, Check, CircleNotch, Copy, File, FileCode, FileText, Folder, FolderOpen, MagnifyingGlass, Paperclip, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { useSessionStore } from '@/src/store/session';
import { useGitStore } from '@/src/store/git';
import { useWorkbenchStore, type ProjectFileAttachmentRequest } from '@/src/store/workbench';
import { buildProjectFileTree, filterProjectFileTree, PROJECT_FILE_DRAG_MIME, useProjectFilesStore, type ProjectFileTreeNode } from '@/src/store/project-files';
import styles from './TargetProjectFilesPanel.module.css';

function fileExtension(name: string): string {
	const extension = name.split('.').pop()?.toLowerCase();
	return extension && extension !== name.toLowerCase() ? extension : '';
}

function FileTypeIcon({ node }: { node: ProjectFileTreeNode }) {
	if (node.kind === 'directory') return node.children.length > 0 ? <Folder weight="regular" size={15} /> : <FolderOpen weight="regular" size={15} />;
	const extension = fileExtension(node.name);
	if (['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'html', 'vue', 'py', 'java', 'go', 'rs', 'sql', 'sh'].includes(extension)) return <FileCode weight="regular" size={15} />;
	if (['json', 'jsonc', 'yaml', 'yml', 'toml'].includes(extension)) return <FileCode weight="regular" size={15} />;
	if (['md', 'txt', 'log', 'csv'].includes(extension)) return <FileText weight="regular" size={15} />;
	return <File weight="regular" size={15} />;
}

function joinWorkspacePath(workspacePath: string, relativePath: string): string {
	const separator = workspacePath.includes('\\') || /^[A-Za-z]:/.test(workspacePath) ? '\\' : '/';
	const base = workspacePath.replace(/[\\/]+$/, '');
	return `${base}${separator}${relativePath.replace(/\//g, separator)}`;
}

function requestId(path: string): string {
	return `project-file-${Date.now()}-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

interface FileTreeProps {
	nodes: ProjectFileTreeNode[];
	depth: number;
	expanded: Set<string>;
	selected: Set<string>;
	/** 仓库相对路径 -> Git 状态字母；无仓库或未变更返回 null。 */
	statusOf: (path: string) => string | null;
	onToggle: (node: ProjectFileTreeNode) => void;
	onSelect: (node: ProjectFileTreeNode, event: React.MouseEvent) => void;
	onAdd: (node: ProjectFileTreeNode) => void;
	onDragStart: (node: ProjectFileTreeNode, event: DragEvent<HTMLDivElement>) => void;
}

function FileTree({ nodes, depth, expanded, selected, statusOf, onToggle, onSelect, onAdd, onDragStart }: FileTreeProps) {
	return <>
		{nodes.map((node) => {
			const isDirectory = node.kind === 'directory';
			const isExpanded = expanded.has(node.path);
			const isSelected = selected.has(node.path);
			const gitStatus = isDirectory ? null : statusOf(node.path);
			return <div key={node.path} className={styles.treeBranch} role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined} aria-selected={!isDirectory ? isSelected : undefined}>
				<div
					className={`${styles.treeRow} ${isSelected ? styles.treeRowSelected : ''}`}
					style={{ paddingLeft: `${8 + depth * 15}px` }}
					draggable={!isDirectory}
					onDragStart={(event) => onDragStart(node, event)}
				>
					<Button type="button" variant="unstyled" className={styles.treeRowButton} onClick={(event) => onSelect(node, event)} aria-label={isDirectory ? `${isExpanded ? '收起' : '展开'} ${node.path}` : `选择 ${node.path}`}>
						<span className={styles.treeDisclosure}>{isDirectory ? <CaretRight weight="bold" size={14} className={isExpanded ? styles.treeDisclosureExpanded : ''} /> : null}</span>
						<span className={`${styles.treeIcon} ${isDirectory ? styles.treeFolderIcon : ''}`}><FileTypeIcon node={node} /></span>
						<span className={styles.treeName}>{node.name}</span>
						{gitStatus && <span className={`${styles.gitBadge} ${gitStatusClass(gitStatus)}`}>{gitStatus}</span>}
					</Button>
					{!isDirectory && <Hint content="添加到对话框"><Button type="button" variant="ghost" size="icon-sm" className={styles.treeAction} onClick={(event) => { event.stopPropagation(); onAdd(node); }} aria-label={`添加 ${node.path} 到对话框`}><Paperclip weight="regular" size={13} /></Button></Hint>}
				</div>
				{isDirectory && isExpanded && node.children.length > 0 && <FileTree nodes={node.children} depth={depth + 1} expanded={expanded} selected={selected} statusOf={statusOf} onToggle={onToggle} onSelect={onSelect} onAdd={onAdd} onDragStart={onDragStart} />}
			</div>;
		})}
	</>;
}

/** Git 状态字母 -> 徽章样式类；M=修改 A=新增 D=删除 R=重命名 C=冲突 U=未跟踪。 */
function gitStatusClass(letter: string): string {
	if (letter === 'A') return styles.gitBadgeAdded;
	if (letter === 'D') return styles.gitBadgeDeleted;
	if (letter === 'R') return styles.gitBadgeRenamed;
	if (letter === 'C') return styles.gitBadgeConflict;
	if (letter === 'U') return styles.gitBadgeUntracked;
	return styles.gitBadgeModified;
}

/** Code 右侧项目文件树：只操作文件路径元数据，不打开或读取代码内容。 */
export function TargetProjectFilesPanel() {
	const workspacePath = useSessionStore((state) => state.currentProjectPath);
	const sessionPath = useSessionStore((state) => state.selectedSessionPath ?? state.sessionState?.sessionFile ?? '__new__');
	const entries = useProjectFilesStore((state) => state.entries);
	const loading = useProjectFilesStore((state) => state.loading);
	const error = useProjectFilesStore((state) => state.error);
	// 扫描达到条目/深度上限时告知列表不完整，避免用户误以为文件缺失。
	const truncated = useProjectFilesStore((state) => state.truncated);
	const refresh = useProjectFilesStore((state) => state.refresh);
	const queueProjectFileAttachments = useWorkbenchStore((state) => state.queueProjectFileAttachments);
	const gitFiles = useGitStore((state) => state.state?.files);
	const [query, setQuery] = useState('');
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [copied, setCopied] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		void refresh(workspacePath);
		setQuery('');
		setSelected(new Set());
	}, [refresh, workspacePath]);

	const tree = useMemo(() => buildProjectFileTree(entries), [entries]);
	const filteredTree = useMemo(() => filterProjectFileTree(tree, query), [query, tree]);
	// 文件树 Git 标记与 Git 面板同源（store/git.ts），暂存字母优先于工作区字母。
	const gitStatusMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const file of gitFiles ?? []) {
			if (file.conflicted) map.set(file.path, 'C');
			else if (file.staged) map.set(file.path, file.staged);
			else if (file.worktree) map.set(file.path, file.worktree);
			else if (file.untracked) map.set(file.path, 'U');
		}
		return map;
	}, [gitFiles]);
	const statusOf = (path: string): string | null => gitStatusMap.get(path) ?? null;
	useEffect(() => {
		setExpanded((previous) => {
			const next = new Set([...previous].filter((path) => entries.some((entry) => entry.path === path && entry.kind === 'directory')));
			if (previous.size === 0 && query.trim()) {
				for (const entry of entries) if (entry.kind === 'directory') next.add(entry.path);
			}
			return next;
		});
		setSelected((previous) => new Set([...previous].filter((path) => entries.some((entry) => entry.path === path && entry.kind === 'file'))));
	}, [entries, query]);

	const selectedFiles = useMemo(() => entries.filter((entry) => entry.kind === 'file' && selected.has(entry.path)), [entries, selected]);
	const setTemporaryNotice = (message: string) => {
		setNotice(message);
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		noticeTimer.current = setTimeout(() => setNotice(null), 2_400);
	};
	useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

	const enqueueFiles = (nodes: Array<Pick<ProjectFileTreeNode, 'path' | 'name'>>) => {
		if (!workspacePath) return;
		const requests: ProjectFileAttachmentRequest[] = nodes.map((node, index) => ({
			id: `${requestId(node.path)}-${index}`,
			path: joinWorkspacePath(workspacePath, node.path),
			name: node.name,
			workspacePath,
			sessionPath,
		}));
		queueProjectFileAttachments(requests);
		setTemporaryNotice(`已将 ${requests.length} 个文件放入对话框`);
	};

	const addSelected = () => {
		if (selectedFiles.length === 0) {
			setTemporaryNotice('请先选择文件');
			return;
		}
		enqueueFiles(selectedFiles);
	};
	const selectNode = (node: ProjectFileTreeNode, event: React.MouseEvent) => {
		if (node.kind === 'directory') {
			onToggle(node);
			return;
		}
		setSelected((previous) => {
			const next = new Set(event.metaKey || event.ctrlKey ? previous : []);
			if (next.has(node.path)) next.delete(node.path);
			else next.add(node.path);
			return next;
		});
	};
	const onToggle = (node: ProjectFileTreeNode) => {
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(node.path)) next.delete(node.path);
			else next.add(node.path);
			return next;
		});
	};
	const onDragStart = (node: ProjectFileTreeNode, event: DragEvent<HTMLDivElement>) => {
		if (node.kind !== 'file' || !workspacePath) return;
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData(PROJECT_FILE_DRAG_MIME, JSON.stringify({ path: joinWorkspacePath(workspacePath, node.path), name: node.name, workspacePath, sessionPath }));
		event.dataTransfer.setData('text/plain', node.path);
	};
	const copySelectedPath = async () => {
		if (selectedFiles.length !== 1) {
			setTemporaryNotice('请选择一个文件后复制相对路径');
			return;
		}
		try {
			await navigator.clipboard.writeText(selectedFiles[0].path);
			setCopied(true);
			setTemporaryNotice('相对路径已复制');
			setTimeout(() => setCopied(false), 1_400);
		} catch {
			setTemporaryNotice('复制失败，请手动记录路径');
		}
	};

	return <section className={styles.panel} aria-label="工作空间文件">
	<header className={styles.header}>
		<div className={styles.headerTitle}><FolderOpen weight="regular" size={16} /><span>工作空间文件</span>{entries.length > 0 && <small>{entries.filter((entry) => entry.kind === 'file').length}</small>}</div>
		<div className={styles.headerActions}><Hint content="刷新文件树"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void refresh(workspacePath)} disabled={loading || !workspacePath} aria-label="刷新工作空间文件"><ArrowClockwise weight="regular" size={16} className={loading ? styles.spin : ''} /></Button></Hint></div>
	</header>
	<div className={styles.toolbar}>
		<div className={styles.search}><MagnifyingGlass weight="regular" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件" aria-label="搜索工作空间文件" /><button type="button" onClick={() => setQuery('')} aria-label="清空搜索" className={styles.clearSearch} hidden={!query}><X weight="bold" size={13} /></button></div>
	</div>
		{selectedFiles.length > 0 && <div className={styles.selectionBar}><span>已选 {selectedFiles.length} 个文件</span><div><Button type="button" size="sm" variant="secondary" onClick={addSelected}>添加到对话框</Button><Hint content="复制相对路径"><Button type="button" size="icon-sm" variant="ghost" onClick={() => void copySelectedPath()} aria-label="复制相对路径">{copied ? <Check weight="bold" size={14} /> : <Copy weight="regular" size={14} />}</Button></Hint></div></div>}
		{notice && <div className={styles.notice} role="status">{notice}</div>}
		{truncated && !loading && entries.length > 0 && <div className={styles.truncatedHint} role="status">文件较多，已达扫描上限，列表可能不完整</div>}
	{!workspacePath ? <div className={styles.empty}><FolderOpen weight="regular" size={21} /><span className={styles.emptyTitle}>尚未选择工作空间</span><span>选择 Code 工作空间后，这里会显示只读文件树。</span></div> : loading && entries.length === 0 ? <div className={styles.empty}><CircleNotch weight="bold" size={20} className={styles.spin} /><span>正在扫描工作空间文件…</span></div> : error ? <div className={styles.empty}><WarningCircle weight="regular" size={21} /><span className={styles.emptyTitle}>工作空间文件加载失败</span><span>{error}</span><Button type="button" size="sm" variant="secondary" onClick={() => void refresh(workspacePath)}>重试</Button></div> : entries.length === 0 ? <div className={styles.empty}><File weight="regular" size={21} /><span className={styles.emptyTitle}>工作空间中暂无可展示文件</span><span>忽略目录、空目录和符号链接不会出现在列表中。</span></div> : filteredTree.length === 0 ? <div className={styles.empty}><MagnifyingGlass weight="regular" size={21} /><span className={styles.emptyTitle}>没有匹配文件</span><span>尝试搜索文件名或相对路径。</span></div> : <ScrollArea className={styles.treeScroll} fitContent><div className={styles.tree} role="tree" aria-label="工作空间文件树"><FileTree nodes={filteredTree} depth={0} expanded={expanded} selected={selected} statusOf={statusOf} onToggle={onToggle} onSelect={selectNode} onAdd={(node) => enqueueFiles([node])} onDragStart={onDragStart} /></div></ScrollArea>}
	</section>;
}
