/** 目标右键菜单：编辑区、工作目录与任务使用统一的桌面菜单语义。 */
import { useState, type ReactNode } from 'react';
import { CheckSquare, Clipboard, Copy, FilePlus2, FolderOpen, Scissors, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/src/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import styles from './TargetContextMenu.module.css';

type EditableElement = HTMLInputElement | HTMLTextAreaElement;
type SidebarMenuKind = 'project' | 'project-task' | 'standalone-task';
interface EditMenuState { kind: 'edit'; target: EventTarget | null; hasSelection: boolean; }
interface SidebarMenuState { kind: SidebarMenuKind; projectPath?: string; sessionPath?: string; cwd?: string; }
interface DeleteState { kind: 'project' | 'session'; path: string; }
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
	if (!row || !kind || !['project', 'project-task', 'standalone-task'].includes(kind)) return null;
	return { kind, projectPath: row.dataset.projectPath, sessionPath: row.dataset.sessionPath, cwd: row.dataset.sessionCwd };
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
		const path = current.kind === 'project' ? current.projectPath : current.sessionPath;
		if (!path) return;
		setMenu(null);
		setDeleteState({ kind: current.kind === 'project' ? 'project' : 'session', path });
	};

	const confirmDelete = () => {
		if (!deleteState) return;
		if (deleteState.kind === 'project') removeProject(deleteState.path);
		else removeSessionFromList(deleteState.path);
		setDeleteState(null);
	};

	const sidebarAction = async (action: 'new-project-task' | 'open-folder', current: SidebarMenuState) => {
		setMenu(null);
		if (action === 'new-project-task' && current.projectPath) {
			await newSession(current.projectPath);
			return;
		}
		await revealFolder(current.kind === 'project' ? current.projectPath : current.cwd, reportError);
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
						{menu.kind === 'project' ? (
							<>
								<ContextMenuItem disabled={connection !== 'ready'} onSelect={() => void sidebarAction('new-project-task', menu)}><FilePlus2 />新建项目任务</ContextMenuItem>
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
						<DialogTitle>{deleteState?.kind === 'project' ? '删除工作目录' : '从列表删除任务'}</DialogTitle>
						<DialogDescription id="sidebar-delete-description">仅从 GitPilot 侧栏列表移除，不会删除磁盘上的文件。</DialogDescription>
					</DialogHeader>
					<div className="px-5 py-4 text-xs text-[var(--muted-foreground)]">确认要移除“{deleteState?.path ?? ''}”吗？</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeleteState(null)}>取消</Button>
						<Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
