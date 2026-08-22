/** 目标右键菜单：编辑区、工作目录与任务使用统一的桌面菜单语义。 */
import { useState, type ReactNode } from 'react';
import { CheckSquare, ClipboardText as Clipboard, Copy, FilePlus as FilePlus2, FolderOpen, Scissors, Trash as Trash2 } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/src/store/session';
import { useWorkStore } from '@/src/store/work';
import { useDesignStore } from '@/src/store/design';
import { Button } from '@/src/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/src/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import styles from './TargetContextMenu.module.css';

type EditableElement = HTMLInputElement | HTMLTextAreaElement;
type SidebarMenuKind = 'project' | 'project-task' | 'standalone-task' | 'work-project' | 'work-task' | 'design-project';
interface EditMenuState { kind: 'edit'; target: EventTarget | null; hasSelection: boolean; }
/** Work 任务和工作空间分别通过自身 id/path 操作，避免误走 Code 会话删除流程。 */
interface SidebarMenuState { kind: SidebarMenuKind; projectPath?: string; sessionPath?: string; cwd?: string; workTaskId?: string; }
interface DeleteState { kind: 'project' | 'session' | 'work-project' | 'work-task' | 'design-project'; path: string; workTaskId?: string; }
type MenuState = EditMenuState | SidebarMenuState;

function editableTarget(target: EventTarget | null): EditableElement | null {
	return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
}

function hasEditableSelection(target: EditableElement | null): boolean {
	return Boolean(target && target.selectionStart !== null && target.selectionEnd !== null && target.selectionStart !== target.selectionEnd);
}

function sidebarTarget(target: EventTarget | null): SidebarMenuState | null {
	if (!(target instanceof Element)) return null;
	const row = target.closest<HTMLElement>('[data-sidebar-menu-kind]');
	const kind = row?.dataset.sidebarMenuKind as SidebarMenuKind | undefined;
	if (!row || !kind || !['project', 'project-task', 'standalone-task', 'work-project', 'work-task', 'design-project'].includes(kind)) return null;
	return { kind, projectPath: row.dataset.projectPath, sessionPath: row.dataset.sessionPath, cwd: row.dataset.sessionCwd, workTaskId: row.dataset.workTaskId };
}

async function revealFolder(path: string | undefined, reportError: (message: string) => void): Promise<void> {
	if (!path) return;
	try {
		await invoke('reveal_path', { path });
	} catch (error) {
		reportError(error instanceof Error ? error.message : String(error));
	}
}

export function TargetContextMenu({ children }: { children: ReactNode }) {
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
	const newSession = useSessionStore((s) => s.newSession);
	const removeProject = useSessionStore((s) => s.removeProject);
	const removeSessionFromList = useSessionStore((s) => s.removeSessionFromList);
	const deleteWorkTask = useWorkStore((s) => s.deleteTask);
	const createWorkTask = useWorkStore((s) => s.createTask);
	const selectWorkTask = useWorkStore((s) => s.selectTask);
	const removeWorkWorkspace = useWorkStore((s) => s.removeWorkspace);
	const removeDesignProject = useDesignStore((s) => s.removeProject);
	const reportError = useSessionStore((s) => s.reportError);
	const connection = useSessionStore((s) => s.connection);

	const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
		const target = sidebarTarget(event.target);
		if (target) {
			setMenu(target);
			return;
		}
		setMenu({ kind: 'edit', target: event.target, hasSelection: Boolean(window.getSelection()?.toString().trim()) });
	};

	const editable = menu?.kind === 'edit' ? editableTarget(menu.target) : null;
	const canCopy = Boolean(menu?.kind === 'edit' && (menu.hasSelection || hasEditableSelection(editable)));
	const edit = async (action: 'copy' | 'cut' | 'paste' | 'select-all') => {
		const target = editableTarget(menu?.kind === 'edit' ? menu.target : null);
		if (target) target.focus();
		if (action === 'paste' && target) {
			try {
				const text = await navigator.clipboard.readText();
				target.setRangeText(text, target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length, 'end');
				target.dispatchEvent(new Event('input', { bubbles: true }));
			} catch {
				/* WebView 无剪贴板权限时交由系统快捷键处理。 */
			}
		} else if (action === 'select-all' && target) target.select();
		else document.execCommand(action === 'select-all' ? 'selectAll' : action);
		setMenu(null);
	};

	const requestDelete = (current: SidebarMenuState) => {
		const path = current.kind === 'project' || current.kind === 'work-project' || current.kind === 'design-project' ? current.projectPath : current.kind === 'work-task' ? (current.cwd || current.workTaskId) : current.sessionPath;
		if (!path || (current.kind === 'work-task' && !current.workTaskId)) return;
		setMenu(null);
		setDeleteState({ kind: current.kind === 'project' ? 'project' : current.kind === 'work-project' ? 'work-project' : current.kind === 'design-project' ? 'design-project' : current.kind === 'work-task' ? 'work-task' : 'session', path, workTaskId: current.workTaskId });
	};

	const confirmDelete = () => {
		if (!deleteState) return;
		if (deleteState.kind === 'project') removeProject(deleteState.path);
		else if (deleteState.kind === 'work-project') removeWorkWorkspace(deleteState.path);
		else if (deleteState.kind === 'design-project') removeDesignProject(deleteState.path);
		else if (deleteState.kind === 'work-task') deleteWorkTask(deleteState.workTaskId ?? deleteState.path);
		else removeSessionFromList(deleteState.path);
		setDeleteState(null);
	};

	const sidebarAction = async (action: 'new-project-task' | 'new-workspace-task' | 'open-folder', current: SidebarMenuState) => {
		setMenu(null);
		if (action === 'new-project-task' && current.projectPath) {
			await newSession(current.projectPath);
			return;
		}
		if (action === 'new-workspace-task' && current.projectPath) {
			const task = createWorkTask(current.projectPath);
			selectWorkTask(task.id);
			return;
		}
		await revealFolder(current.kind === 'project' || current.kind === 'work-project' || current.kind === 'design-project' ? current.projectPath : current.cwd, reportError);
	};

	const shortcut = (text: string) => <span className={styles.shortcut}>{text}</span>;
	return (
		<>
			<ContextMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null); }}>
				<ContextMenuTrigger asChild>
					<div className={styles.surface} onContextMenu={onContextMenu}>{children}</div>
				</ContextMenuTrigger>
				{menu?.kind === 'edit' && (
					<ContextMenuContent className={styles.editContent}>
						<ContextMenuItem disabled={!canCopy} onSelect={() => void edit('copy')}><Copy />复制{shortcut('Ctrl+C')}</ContextMenuItem>
						<ContextMenuItem disabled={!editable || !hasEditableSelection(editable)} onSelect={() => void edit('cut')}><Scissors />剪切{shortcut('Ctrl+X')}</ContextMenuItem>
						<ContextMenuItem disabled={!editable} onSelect={() => void edit('paste')}><Clipboard />粘贴{shortcut('Ctrl+V')}</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem disabled={!editable} onSelect={() => void edit('select-all')}><CheckSquare />全选{shortcut('Ctrl+A')}</ContextMenuItem>
					</ContextMenuContent>
				)}
				{menu && menu.kind !== 'edit' && (
					<ContextMenuContent className={styles.sidebarContent}>
						{menu.kind === 'project' || menu.kind === 'work-project' ? (
							<>
								<ContextMenuItem disabled={menu.kind === 'project' && connection !== 'ready'} onSelect={() => void sidebarAction(menu.kind === 'work-project' ? 'new-workspace-task' : 'new-project-task', menu)}><FilePlus2 />新建工作空间任务</ContextMenuItem>
								<ContextMenuItem onSelect={() => void sidebarAction('open-folder', menu)}><FolderOpen />在文件夹中打开</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem className={styles.danger} onSelect={() => requestDelete(menu)}><Trash2 />从列表删除</ContextMenuItem>
							</>
						) : (
							<>
								<ContextMenuItem onSelect={() => void sidebarAction('open-folder', menu)}><FolderOpen />在文件夹中打开</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem className={styles.danger} onSelect={() => requestDelete(menu)}><Trash2 />从列表删除</ContextMenuItem>
							</>
						)}
					</ContextMenuContent>
				)}
			</ContextMenu>
			<Dialog open={deleteState !== null} onOpenChange={(open) => { if (!open) setDeleteState(null); }}>
				<DialogContent aria-describedby="sidebar-delete-description">
					<DialogHeader>
						<DialogTitle>{deleteState?.kind === 'project' || deleteState?.kind === 'work-project' ? '删除工作目录' : deleteState?.kind === 'design-project' ? '从列表删除设计工作空间' : deleteState?.kind === 'work-task' ? '从列表删除 Work 任务' : '从列表删除任务'}</DialogTitle>
						<DialogDescription id="sidebar-delete-description">仅从 GitPilot 侧栏列表移除，不会删除磁盘上的文件。</DialogDescription>
					</DialogHeader>
					<div className="px-5 py-4 text-[length:var(--text-[length:var(--text-xs)])] text-[var(--muted-foreground)]">确认要移除“{deleteState?.path ?? ''}”吗？</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeleteState(null)}>取消</Button>
						<Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
