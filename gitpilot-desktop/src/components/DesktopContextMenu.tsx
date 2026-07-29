/** 自绘桌面右键菜单，屏蔽 WebView 默认浏览器菜单并保留基础编辑能力。 */
import { useEffect, useState } from 'react';
import { CheckSquare, Clipboard, Copy, Scissors } from 'lucide-react';

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
	x: number;
	y: number;
	target: EventTarget | null;
	hasSelection: boolean;
}

function editableTarget(target: EventTarget | null): EditableElement | null {
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target;
	return null;
}

function hasEditableSelection(target: EditableElement | null): boolean {
	if (!target || target.selectionStart === null || target.selectionEnd === null) return false;
	return target.selectionStart !== target.selectionEnd;
}

export function DesktopContextMenu() {
	const [menu, setMenu] = useState<MenuState | null>(null);
	const editable = editableTarget(menu?.target ?? null);
	const canCopy = Boolean(menu?.hasSelection || hasEditableSelection(editable));

	useEffect(() => {
		const openMenu = (event: MouseEvent) => {
			event.preventDefault();
			const target = event.target;
			const selection = window.getSelection()?.toString().trim() ?? '';
			setMenu({
				x: Math.min(event.clientX, Math.max(8, window.innerWidth - 196)),
				y: Math.min(event.clientY, Math.max(8, window.innerHeight - 166)),
				target,
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

	const run = async (action: 'copy' | 'cut' | 'paste' | 'select-all') => {
		const target = editableTarget(menu?.target ?? null);
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

	if (!menu) return null;
	return (
		<div className="desktop-context-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label="编辑菜单" onPointerDown={(event) => event.stopPropagation()}>
			<button type="button" role="menuitem" disabled={!canCopy} onClick={() => void run('copy')}><Copy size={14} />复制<span>Ctrl+C</span></button>
			<button type="button" role="menuitem" disabled={!editable || !hasEditableSelection(editable)} onClick={() => void run('cut')}><Scissors size={14} />剪切<span>Ctrl+X</span></button>
			<button type="button" role="menuitem" disabled={!editable} onClick={() => void run('paste')}><Clipboard size={14} />粘贴<span>Ctrl+V</span></button>
			<div />
			<button type="button" role="menuitem" disabled={!editable} onClick={() => void run('select-all')}><CheckSquare size={14} />全选<span>Ctrl+A</span></button>
		</div>
	);
}
