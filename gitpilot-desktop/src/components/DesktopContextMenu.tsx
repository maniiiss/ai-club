/** 自绘桌面右键菜单：编辑区保留基础编辑能力，侧栏按对象提供项目或任务操作。 */
import { useEffect, useState } from 'react';
import { CheckSquare, Clipboard, Copy, FilePlus2, FileText, FolderOpen, Scissors, Trash2 } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';

type EditableElement = HTMLInputElement | HTMLTextAreaElement;
type SidebarMenuKind = 'project' | 'project-task' | 'standalone-task';

interface EditMenuState {
	kind: 'edit';
	x: number;
	y: number;
	target: EventTarget | null;
	hasSelection: boolean;
}

interface SidebarMenuState {
	kind: SidebarMenuKind;
	x: number;
	y: number;
	projectPath?: string;
	sessionPath?: string;
	cwd?: string;
}

type MenuState = EditMenuState | SidebarMenuState;

function editableTarget(target: EventTarget | null): EditableElement | null {
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target;
	return null;
}

function hasEditableSelection(target: EditableElement | null): boolean {
	if (!target || target.selectionStart === null || target.selectionEnd === null) return false;
	return target.selectionStart !== target.selectionEnd;
}

/** 从侧栏行的 data 属性读取业务对象，避免通用编辑菜单误覆盖项目与任务的操作入口。 */
function sidebarMenuTarget(target: EventTarget | null): Omit<SidebarMenuState, 'x' | 'y'> | null {
	if (!(target instanceof Element)) return null;
	const row = target.closest<HTMLElement>('[data-sidebar-menu-kind]');
	const kind = row?.dataset.sidebarMenuKind as SidebarMenuKind | undefined;
	if (!row || (kind !== 'project' && kind !== 'project-task' && kind !== 'standalone-task')) return null;
	return {
		kind,
		projectPath: row.dataset.projectPath,
		sessionPath: row.dataset.sessionPath,
		cwd: row.dataset.sessionCwd,
	};
}

function menuPosition(x: number, y: number, height: number): Pick<MenuState, 'x' | 'y'> {
	return {
		x: Math.min(x, Math.max(8, window.innerWidth - 220)),
		y: Math.min(y, Math.max(8, window.innerHeight - height)),
	};
}

export function DesktopContextMenu() {
	const [menu, setMenu] = useState<MenuState | null>(null);
	const switchProject = useSessionStore((state) => state.switchProject);
	const newSession = useSessionStore((state) => state.newSession);
	const switchSession = useSessionStore((state) => state.switchSession);
	const removeProject = useSessionStore((state) => state.removeProject);
	const connection = useSessionStore((state) => state.connection);
	const editable = menu?.kind === 'edit' ? editableTarget(menu.target) : null;
	const canCopy = Boolean(menu?.kind === 'edit' && (menu.hasSelection || hasEditableSelection(editable)));

	useEffect(() => {
		const openMenu = (event: MouseEvent) => {
			event.preventDefault();
			const sidebarTarget = sidebarMenuTarget(event.target);
			if (sidebarTarget) {
				const itemCount = sidebarTarget.kind === 'project' ? 4 : 3;
				setMenu({ ...sidebarTarget, ...menuPosition(event.clientX, event.clientY, itemCount * 34 + 20) });
				return;
			}
			const selection = window.getSelection()?.toString().trim() ?? '';
			setMenu({
				kind: 'edit',
				...menuPosition(event.clientX, event.clientY, 166),
				target: event.target,
				hasSelection: Boolean(selection),
			});
		};
		const dismiss = () => setMenu(null);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') dismiss();
		};
		document.addEventListener('contextmenu', openMenu);
		document.addEventListener('pointerdown', dismiss);
		window.addEventListener('blur', dismiss);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('contextmenu', openMenu);
			document.removeEventListener('pointerdown', dismiss);
			window.removeEventListener('blur', dismiss);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	const runEditAction = async (action: 'copy' | 'cut' | 'paste' | 'select-all') => {
		const target = editableTarget(menu?.kind === 'edit' ? menu.target : null);
		if (target) target.focus();
		if (action === 'paste' && target) {
			try {
				const text = await navigator.clipboard.readText();
				target.setRangeText(text, target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length, 'end');
				target.dispatchEvent(new Event('input', { bubbles: true }));
			} catch {
				// WebView 拒绝读取剪贴板时不伪造内容，用户仍可使用 Ctrl+V。
			}
		} else if (action === 'select-all' && target) {
			target.select();
		} else {
			document.execCommand(action === 'select-all' ? 'selectAll' : action);
		}
		setMenu(null);
	};

	/** 侧栏菜单只调用已存在的会话/项目动作；复制失败时静默收口，避免阻断用户切换任务。 */
	const runSidebarAction = async (action: 'open-project' | 'new-project-task' | 'remove-project' | 'open-task' | 'copy-project-path' | 'copy-session-path' | 'copy-cwd') => {
		if (!menu || menu.kind === 'edit') return;
		const currentMenu = menu;
		setMenu(null);
		if (action === 'open-project' && currentMenu.projectPath) {
			await switchProject(currentMenu.projectPath);
			return;
		}
		if (action === 'new-project-task' && currentMenu.projectPath) {
			await newSession(currentMenu.projectPath);
			return;
		}
		if (action === 'remove-project' && currentMenu.projectPath) {
			removeProject(currentMenu.projectPath);
			return;
		}
		if (action === 'open-task' && currentMenu.sessionPath) {
			await switchSession(currentMenu.sessionPath);
			return;
		}
		const text = action === 'copy-project-path'
			? currentMenu.projectPath
			: action === 'copy-session-path'
				? currentMenu.sessionPath
				: currentMenu.cwd;
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// WebView 没有剪贴板授权时保持菜单关闭，避免无效操作阻塞当前对话。
		}
	};

	if (!menu) return null;
	if (menu.kind === 'edit') {
		return (
			<div className="desktop-context-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label="编辑菜单" onPointerDown={(event) => event.stopPropagation()}>
				<button type="button" role="menuitem" disabled={!canCopy} onClick={() => void runEditAction('copy')}><Copy size={14} />复制<span>Ctrl+C</span></button>
				<button type="button" role="menuitem" disabled={!editable || !hasEditableSelection(editable)} onClick={() => void runEditAction('cut')}><Scissors size={14} />剪切<span>Ctrl+X</span></button>
				<button type="button" role="menuitem" disabled={!editable} onClick={() => void runEditAction('paste')}><Clipboard size={14} />粘贴<span>Ctrl+V</span></button>
				<div />
				<button type="button" role="menuitem" disabled={!editable} onClick={() => void runEditAction('select-all')}><CheckSquare size={14} />全选<span>Ctrl+A</span></button>
			</div>
		);
	}

	const actionDisabled = connection !== 'ready';
	const taskMenu = (
		<>
			<button type="button" role="menuitem" disabled={actionDisabled} onClick={() => void runSidebarAction('open-task')}><FileText size={14} />打开任务</button>
			<div />
			<button type="button" role="menuitem" onClick={() => void runSidebarAction('copy-session-path')}><Copy size={14} />复制会话文件路径</button>
			<button type="button" role="menuitem" onClick={() => void runSidebarAction('copy-cwd')}><FolderOpen size={14} />复制工作目录</button>
		</>
	);

	return (
		<div className="desktop-context-menu desktop-context-menu--sidebar" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={menu.kind === 'project' ? '项目菜单' : menu.kind === 'project-task' ? '项目任务菜单' : '独立任务菜单'} onPointerDown={(event) => event.stopPropagation()}>
			{menu.kind === 'project' ? <>
				<button type="button" role="menuitem" disabled={actionDisabled} onClick={() => void runSidebarAction('open-project')}><FolderOpen size={14} />打开项目</button>
				<button type="button" role="menuitem" disabled={actionDisabled} onClick={() => void runSidebarAction('new-project-task')}><FilePlus2 size={14} />新建项目任务</button>
				<div />
				<button type="button" role="menuitem" onClick={() => void runSidebarAction('copy-project-path')}><Copy size={14} />复制项目路径</button>
				<button type="button" role="menuitem" className="is-danger" onClick={() => void runSidebarAction('remove-project')}><Trash2 size={14} />从列表移除</button>
			</> : taskMenu}
		</div>
	);
}
