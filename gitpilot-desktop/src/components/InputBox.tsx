/**
 * 输入框。
 *
 * - Enter 发送，Shift+Enter 换行
 * - 输入 / 触发命令面板（见 CommandPalette）
 * - 流式中输入为 steer（不打断当前回合）；有输入时主按钮发送，没有输入时才显示停止按钮
 * - 模型与思维级别选择器置于悬浮编辑器底部操作栏，发送指令前可就近调整
 * - 附件：右侧加号菜单选文件 / 拖拽放入 / 粘贴图片，经 sidecar 解析后随消息注入
 *   （图片走 prompt.images，文档文本以 <file> 块追加；UI 仅展示 chip 与缩略图）
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Bug, ClipboardList, CornerUpRight, FileText, Image as ImageIcon, Loader2, Pencil, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import History from '@tiptap/extension-history';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Text from '@tiptap/extension-text';
import { CommandTokenNode, createCommandDocument, findCommandToken, serializeCommandContent } from './CommandTokenNode';
import { useSessionStore, useActiveExtensionUI, type GuidanceMode, type GuidanceQueueItem } from '@/src/store/session';
import { CommandPalette } from './CommandPalette';
import { buildWorkItemPrompt, ComposerAddMenu, createWorkItemAttachment, type ComposerAddTab } from './ComposerAddMenu';
import { ExtensionUIConfirmCard, ExtensionUISelectCard, isActionSelect } from './ExtensionUIModal';
import { isHostActionCommand } from './host-actions';
import { ModelPicker } from './ModelPicker';
import { useWorkbenchStore } from '@/src/store/workbench';
import { useSettingsDialogStore } from '@/src/store/settings';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, PreparedAttachment, RpcSlashCommand, RpcWorkItemSummary } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './InputBox.module.css';
import { PlanProgressStatus } from './PlanProgressStatus';

export { formatCommandLabel, getCommandIconKey } from './CommandTokenNode';

const COMPOSER_EXTENSIONS = [
	Document,
	Paragraph,
	Text,
	HardBreak,
	History,
	Placeholder.configure({ placeholder: '描述任务，/ 查看命令，可附加文件' }),
	CommandTokenNode,
];

/** 文件大小可读化（UI 展示用）。 */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 输入命中区的提交条件与视觉层解耦，避免附件/解析状态变化时按钮语义漂移。 */
export function canSubmitPrompt(text: string, attachmentCount: number, preparing: boolean): boolean {
	return (text.trim().length > 0 || attachmentCount > 0) && !preparing;
}

/** 将已选命令与参数还原成 sidecar 需要的 slash prompt，保证视觉 token 不改变协议格式。 */
export function buildCommandPrompt(selectedCommand: string | null, text: string): string {
	const content = text.trim();
	if (!selectedCommand) return content;
	if (content === `/${selectedCommand}` || content.startsWith(`/${selectedCommand} `)) return content;
	return `/${selectedCommand}${content ? ` ${content}` : ''}`;
}

/** 透明命中层只负责布局，避免挡住中心区滚动条；真正控件再恢复指针事件。 */
export const INPUT_COMPOSER_POINTER_POLICY = { overlay: 'none', interactive: 'auto' } as const;

/** 运行中不能排队执行扩展命令；Prompt/Skill 命令仍交给 sidecar 展开。 */
export function isExtensionQueueCommand(text: string, commands: RpcSlashCommand[]): boolean {
	const match = text.match(/^\/(\S+)/);
	if (!match) return false;
	return commands.some((command) => command.name === match[1] && command.source === 'extension');
}

function guidanceStatusLabel(status: GuidanceQueueItem['status']): string {
	if (status === 'submitting') return '发送中';
	if (status === 'queued') return '已排队';
	if (status === 'applying') return '处理中';
	if (status === 'applied') return '已交给 GitPilot';
	if (status === 'cancelled') return '已取消';
	return '发送失败';
}

/** 用稳定来源标识去重，避免 Tauri 重复投递同一个路径时出现两个附件 chip。 */
export function attachmentInputKey(input: AttachmentInput): string {
	if ('path' in input) return `path:${input.path.replace(/\\/g, '/').toLowerCase()}`;
	return `inline:${input.name}\u0000${input.mimeType ?? ''}\u0000${input.data}`;
}

/** 同一次拖拽或文件选择中，保留用户实际选择顺序但过滤重复来源。 */
export function dedupeAttachmentInputs(items: AttachmentInput[]): AttachmentInput[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = attachmentInputKey(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** 合并解析结果时再次按路径去重，覆盖重复事件并发返回的竞态。 */
function mergePreparedAttachments(previous: PreparedAttachment[], next: PreparedAttachment[]): PreparedAttachment[] {
	const seen = new Set(previous.map((item) => item.path ? `path:${item.path.replace(/\\/g, '/').toLowerCase()}` : `meta:${item.name}\u0000${item.kind}\u0000${item.mimeType}\u0000${item.sizeBytes}`));
	const merged = [...previous];
	for (const item of next) {
		const key = item.path ? `path:${item.path.replace(/\\/g, '/').toLowerCase()}` : `meta:${item.name}\u0000${item.kind}\u0000${item.mimeType}\u0000${item.sizeBytes}`;
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(item);
	}
	return merged;
}

export function InputBox() {
	const composerSessionPath = useSessionStore((s) => s.selectedSessionPath ?? s.sessionState?.sessionFile ?? '__new__');
	const setComposerDraft = useSessionStore((s) => s.setComposerDraft);
	const getComposerDraft = useSessionStore((s) => s.getComposerDraft);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const isSessionLoading = useSessionStore((s) => s.isSessionLoading);
	const commands = useSessionStore((s) => s.commands);
	// 按会话隔离的待响应扩展 UI：切走会话时弹框隐藏，不带到新会话。
	const activeExtensionUI = useActiveExtensionUI();
	const hasPendingConfirm = activeExtensionUI?.method === 'confirm';
	/** 动作型 select（如 plan 模式下一步）以输入框上方浮层呈现，与 / 命令面板互斥。 */
	const hasPendingActionSelect = isActionSelect(activeExtensionUI ?? null);
	const prompt = useSessionStore((s) => s.prompt);
	const executeCommand = useSessionStore((s) => s.executeCommand);

	/** 输入框按钮入口：执行需要二次操作的扩展命令（requirement/rtk 等），不发送到对话 */
	const runHostAction = (cmd: RpcSlashCommand) => {
		if (cmd.name === 'requirement') {
			void executeCommand('requirement');
		} else if (cmd.hostAction === 'open_rtk_settings') {
			useSettingsDialogStore.getState().show('rtk');
		}
	};
	const sendGuidance = useSessionStore((s) => s.sendGuidance);
	const replayQueuedGuidance = useSessionStore((s) => s.replayGuidance);
	const removeGuidance = useSessionStore((s) => s.removeGuidance);
	const abort = useSessionStore((s) => s.abort);
	const guidanceQueue = useSessionStore((s) => s.guidanceQueue);
	const isFlushingGuidance = useSessionStore((s) => s.isFlushingGuidance);
	const isStopping = useSessionStore((s) => s.isStopping);
	const composerPrefill = useWorkbenchStore((s) => s.composerPrefill);
	const consumeComposerPrefill = useWorkbenchStore((s) => s.consumeComposerPrefill);

	const [text, setText] = useState('');
	/** 从命令面板选中的命令名（输入框不显示 / 前缀，发送时自动补上） */
	const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
	const [showPalette, setShowPalette] = useState(false);
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [addMenuTab, setAddMenuTab] = useState<ComposerAddTab>('attachments');
	const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>('steer');
	const [submitting, setSubmitting] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const previousComposerSessionPathRef = useRef(composerSessionPath);
	const composerSessionPathRef = useRef(composerSessionPath);
	const composerSessionInitializedRef = useRef(false);
	const composerDraftRef = useRef({ text: '', selectedCommand: null as string | null, attachments: [] as PreparedAttachment[], guidanceMode: 'steer' as GuidanceMode });
	const showPaletteRef = useRef(false);
	const hasActionSelectRef = useRef(false);
	const isStreamingRef = useRef(isStreaming);
	const sendRef = useRef<(modeOverride?: GuidanceMode) => Promise<void>>(async () => undefined);
	showPaletteRef.current = showPalette;
	hasActionSelectRef.current = hasPendingActionSelect;
	isStreamingRef.current = isStreaming;
	composerSessionPathRef.current = composerSessionPath;

	const editor = useEditor({
		extensions: COMPOSER_EXTENSIONS,
		immediatelyRender: true,
		shouldRerenderOnTransaction: false,
		editorProps: {
			attributes: {
				id: 'gitpilot-composer',
				class: styles.editorSurface,
				'aria-label': '任务输入',
			},
			handleKeyDown: (_view, event) => {
				// 命令面板与动作型 select 浮层都注册了全局键盘监听，编辑器只让事件继续冒泡。
				if (showPaletteRef.current || hasActionSelectRef.current) {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Escape') {
						event.preventDefault();
						return true;
					}
					return false;
				}
				if (event.key === 'Enter' && !event.shiftKey) {
					event.preventDefault();
					void sendRef.current(event.altKey && isStreamingRef.current ? 'followUp' : undefined);
					return true;
				}
				return false;
			},
		},
		onUpdate: ({ editor: currentEditor }) => {
			setText(serializeCommandContent(currentEditor.getJSON().content));
			const token = findCommandToken(currentEditor.getJSON().content);
			setSelectedCommand(token?.name ?? null);
		},
	});

	/**
	 * 输入框是悬浮层，实际高度会随引导队列、附件和多行文本变化。
	 * 将它同步到工作区父节点，聊天滚动区才能把终点准确放在输入框顶部。
	 */
	useLayoutEffect(() => {
		const root = rootRef.current;
		const parent = root?.parentElement;
		if (!root || !parent) return;

		const updateComposerSpace = () => {
			const bottomOffset = 16;
			parent.style.setProperty('--gp-composer-bottom-space', `${root.getBoundingClientRect().height + bottomOffset}px`);
		};

		updateComposerSpace();
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateComposerSpace);
		observer?.observe(root);
		return () => {
			observer?.disconnect();
			parent.style.removeProperty('--gp-composer-bottom-space');
		};
	}, []);

	// / 开头且无空格时显示命令面板；/ 后的文本就是命令筛选条件。
	useEffect(() => {
		const m = text.match(/^\/(\S*)$/);
		setShowPalette(selectedCommand === null && m !== null);
	}, [selectedCommand, text]);

	useEffect(() => {
		if (!isStreaming) setGuidanceMode('steer');
	}, [isStreaming]);

	// 重试只复用用户文本，不自动重新执行有副作用的工具调用。
	useEffect(() => {
		if (composerPrefill === null) return;
		if (!editor) return;
		const match = composerPrefill.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
		const command = match ? commands.find((item) => item.name === match[1]) : undefined;
		if (command) {
			editor.commands.setContent(createCommandDocument(command.name, command.source, match?.[2] ?? ''));
		} else {
			editor.commands.setContent({ type: 'doc', content: composerPrefill.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : undefined })) });
		}
		setSelectedCommand(command?.name ?? null);
		consumeComposerPrefill();
		requestAnimationFrame(() => editor.commands.focus('end'));
	}, [commands, composerPrefill, consumeComposerPrefill, editor]);

	useEffect(() => {
		editor?.setEditable(!isSessionLoading);
	}, [editor, isSessionLoading]);

	// Tauri 拖拽：webview 下 HTML5 drop 不给文件路径，用 onDragDropEvent 拿 paths。
	useEffect(() => {
		if (!isTauriEnv()) return;
		let disposed = false;
		let unlisten: (() => void) | undefined;
		(async () => {
			const { getCurrentWebview } = await import('@tauri-apps/api/webview');
			if (disposed) return;
			const cleanup = await getCurrentWebview().onDragDropEvent((event) => {
				if (event.payload.type === 'enter' || event.payload.type === 'over') {
					setIsDragOver(true);
				} else if (event.payload.type === 'leave') {
					setIsDragOver(false);
				} else if (event.payload.type === 'drop') {
					setIsDragOver(false);
					const paths = (event.payload as { paths?: string[] }).paths ?? [];
					const uniquePaths = [...new Set(paths.filter(Boolean))];
					if (uniquePaths.length > 0) void addInputs(uniquePaths.map((p) => ({ path: p })));
				}
			});
			if (disposed) cleanup();
			else unlisten = cleanup;
		})();
		return () => {
			disposed = true;
			unlisten?.();
			unlisten = undefined;
		};
		// addInputs 通过闭包引用最新 state，依赖项保持最小避免反复重订阅。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/** 调 sidecar 预解析附件，结果追加到当前附件列表。 */
	const addInputs = async (items: AttachmentInput[]) => {
		const uniqueItems = dedupeAttachmentInputs(items);
		if (uniqueItems.length === 0) return;
		setPreparing(true);
		setPrepareError(null);
		try {
			const resp = await rpc.prepareAttachments(uniqueItems);
			if (resp.success && resp.command === 'prepare_attachments') {
				setAttachments((prev) => mergePreparedAttachments(prev, resp.data.attachments));
			} else if (!resp.success) {
				setPrepareError(resp.error || '附件解析失败');
			}
		} catch (err) {
			setPrepareError(err instanceof Error ? err.message : String(err));
		} finally {
			setPreparing(false);
		}
	};

	/** 文件选择器：点击回形针按钮触发原生多选。 */
	const pickFiles = async () => {
		setAddMenuOpen(false);
		if (!isTauriEnv()) return;
		const { open } = await import('@tauri-apps/plugin-dialog');
		const selected = await open({ multiple: true, directory: false });
		if (!selected) return;
		const paths = Array.isArray(selected) ? selected : [selected];
		await addInputs(paths.map((p) => ({ path: p })));
	};

	/** 工作项像附件一样进入上下文标签；编辑器只写入对应的分析指令，不自动调用 prompt。 */
	const selectWorkItem = (item: RpcWorkItemSummary) => {
		if (!editor) return;
		const workItemPrompt = buildWorkItemPrompt(item);
		editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: workItemPrompt }] }] });
		setSelectedCommand(null);
		setAttachments((previous) => [...previous.filter((attachment) => attachment.kind !== 'work-item'), createWorkItemAttachment(item)]);
		setAddMenuOpen(false);
		requestAnimationFrame(() => editor.commands.focus('end'));
	};

	/** 粘贴：剪贴板图片 blob -> base64 -> 内联附件。 */
	const onPaste = (e: React.ClipboardEvent<HTMLElement>) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		const imageItems: { file: File }[] = [];
		for (const item of Array.from(items)) {
			if (item.kind === 'file' && item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) imageItems.push({ file });
			}
		}
		if (imageItems.length === 0) return;
		e.preventDefault();
		void Promise.all(
			imageItems.map(
				({ file }) =>
					new Promise<AttachmentInput>((resolve) => {
						const reader = new FileReader();
						reader.onload = () => {
							const result = reader.result;
							if (typeof result !== 'string') return resolve({ name: file.name, data: '', mimeType: file.type });
							// 结果形如 "data:image/png;base64,xxxx"，去掉前缀只留 base64。
							const commaIdx = result.indexOf(',');
							const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
							resolve({ name: file.name || `pasted-${Date.now()}.png`, data, mimeType: file.type || 'image/png' });
						};
						reader.onerror = () => resolve({ name: file.name, data: '', mimeType: file.type });
						reader.readAsDataURL(file);
					}),
			),
		).then((inputs) =>
			addInputs(inputs.filter((i): i is Extract<AttachmentInput, { data: string }> => 'data' in i && i.data.length > 0)),
		);
	};

	const send = async (modeOverride?: GuidanceMode) => {
		const msg = buildCommandPrompt(selectedCommand, text);
		// 附件存在时允许空文本发送（用户只发附件）；否则需要文本。
		if (!msg && attachments.length === 0) return;
		// 拦截二次操作命令（/requirement、/rtk 等）：不发送到对话，改由按钮入口执行二次操作
		const cmdMatch = msg.match(/^\/(\S+)/);
		if (cmdMatch) {
			const cmd = commands.find((c) => c.name === cmdMatch[1]);
			if (cmd && isHostActionCommand(cmd)) {
				setShowPalette(false);
				runHostAction(cmd);
				return;
			}
		}
		if (preparing || submitting || isStopping || isFlushingGuidance) return;
		if (isStreaming) {
			if (isExtensionQueueCommand(msg, commands)) {
				setPrepareError('当前任务执行期间不能排队运行扩展命令，请停止任务后再执行。');
				return;
			}
			setSubmitting(true);
			const accepted = await sendGuidance(msg, attachments, modeOverride ?? guidanceMode);
			setSubmitting(false);
			if (!accepted) return;
		} else {
			prompt(msg || '（仅附件）', attachments);
		}
		setText('');
		setShowPalette(false);
		setSelectedCommand(null);
		editor?.commands.clearContent();
		setAttachments([]);
		setPrepareError(null);
	};
	sendRef.current = send;

	const editGuidance = (item: GuidanceQueueItem) => {
		if (!editor) return;
		const match = item.displayText.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
		const command = match ? commands.find((entry) => entry.name === match[1]) : undefined;
		if (command) {
			editor.commands.setContent(createCommandDocument(command.name, command.source, match?.[2] ?? ''));
		} else {
			editor.commands.setContent({ type: 'doc', content: item.displayText.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : undefined })) });
		}
		setSelectedCommand(command?.name ?? null);
		setAttachments([]);
		setPrepareError(null);
		requestAnimationFrame(() => editor.commands.focus('end'));
	};

	const replayGuidance = async (item: GuidanceQueueItem, mode: GuidanceMode) => {
		if (!isStreaming || submitting || isStopping || isFlushingGuidance) return;
		setSubmitting(true);
		await replayQueuedGuidance(item.id, mode);
		setSubmitting(false);
	};

	const pickCommand = (name: string) => {
		setShowPalette(false);
		const cmd = commands.find((c) => c.name === name);
		// hostAction 路由：/rtk 打开统一设置的 RTK 分区，不调 ctx.ui.custom()
		if (cmd?.hostAction === 'open_rtk_settings') {
			useSettingsDialogStore.getState().show('rtk');
			return;
		}
		// 需求命令本身就是选择器：选中命令后立即打开需求列表，不再要求用户额外发送一次。
		if (name === 'requirement' && !isStreaming && !isSessionLoading) {
			editor?.commands.clearContent();
			setSelectedCommand(null);
			void executeCommand(name);
			return;
		}
		if (!editor || !cmd) return;
		// 命令插入为真正的 inline node，后续参数由同一个编辑器承接光标和换行。
		editor.commands.setContent(createCommandDocument(cmd.name, cmd.source));
		setSelectedCommand(name);
		requestAnimationFrame(() => editor.commands.focus('end'));
	};

	const canSend = canSubmitPrompt(selectedCommand ?? text, attachments.length, preparing || isSessionLoading) && !submitting && !isStopping && !isFlushingGuidance;
	const visibleGuidance = guidanceQueue.slice(-5);
	const hasComposerContent = selectedCommand !== null || text.trim().length > 0 || attachments.length > 0;
	composerDraftRef.current = { text, selectedCommand, attachments, guidanceMode };

	/** 会话切换前先保存旧草稿，再恢复目标会话的文件、Skill、Plan/Goal 命令和输入文本。 */
	useEffect(() => {
		const previousPath = previousComposerSessionPathRef.current;
		const shouldLoadDraft = !composerSessionInitializedRef.current || previousPath !== composerSessionPath;
		if (shouldLoadDraft) {
			if (composerSessionInitializedRef.current) setComposerDraft(previousPath, composerDraftRef.current);
			const draft = getComposerDraft(composerSessionPath);
			setText(draft?.text ?? '');
			setSelectedCommand(draft?.selectedCommand ?? null);
			setAttachments(draft?.attachments ?? []);
			setGuidanceMode(draft?.guidanceMode ?? 'steer');
			if (editor) {
				const match = draft?.text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
				const command = match ? commands.find((item) => item.name === match[1]) : undefined;
				// 命令清单刷新是异步的；切换会话首帧可能还没有目标 cwd 的 plan/goal/skill。
				// 先按草稿中的命令名恢复 token，避免 setContent 普通文本触发 onUpdate 把标识清空。
				const draftCommand = draft?.selectedCommand
					? { name: draft.selectedCommand, source: draft.selectedCommand.startsWith('skill:') ? 'skill' as const : (command?.source ?? 'extension') }
					: undefined;
				const commandToRestore = command ?? draftCommand;
				editor.commands.setContent(commandToRestore
					? createCommandDocument(commandToRestore.name, commandToRestore.source, command ? (match?.[2] ?? '') : (draft?.text ?? '').replace(/^\/\S+\s*/, ''))
					: { type: 'doc', content: (draft?.text ?? '').split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : undefined })) });
			}
			previousComposerSessionPathRef.current = composerSessionPath;
			composerSessionInitializedRef.current = true;
		}
		return () => {
			setComposerDraft(composerSessionPath, composerDraftRef.current);
		};
	}, [commands, composerSessionPath, editor, getComposerDraft, setComposerDraft]);

	// 编辑过程中持续写入当前会话草稿；切换会话不再依赖 effect cleanup 的时序，
	// 因而命令 token（尤其 /plan、/goal）和附件不会因快速切换被旧状态覆盖。
	useEffect(() => {
		if (!composerSessionInitializedRef.current) return;
		setComposerDraft(composerSessionPathRef.current, { text, selectedCommand, attachments, guidanceMode });
	// 故意不把 composerSessionPath 放入依赖：路径变化时先由上面的切换 effect 保存旧路径并恢复目标，
	// 不能在恢复前把旧编辑态写入目标会话。
	}, [attachments, guidanceMode, selectedCommand, setComposerDraft, text]);

	return (
		<div ref={rootRef} className={`${styles.root} ${isDragOver ? styles.dragOver : ''}`}>
			<ExtensionUIConfirmCard />
			<ExtensionUISelectCard />
			{showPalette && !hasPendingConfirm && !hasPendingActionSelect && <CommandPalette commands={commands} query={text.slice(1)} onPick={pickCommand} onDismiss={() => setShowPalette(false)} />}
			<ComposerAddMenu
				open={addMenuOpen && !hasPendingConfirm && !hasPendingActionSelect}
				tab={addMenuTab}
				onTabChange={setAddMenuTab}
				onPickFiles={pickFiles}
				onSelectWorkItem={selectWorkItem}
				onDismiss={() => setAddMenuOpen(false)}
			/>
			{isDragOver && (
				<div className={styles.dropHint}>松开以附加文件</div>
			)}
			<div className={styles.surface}>
				<PlanProgressStatus />
				{visibleGuidance.length > 0 && (
					<div className={styles.guidanceList} aria-label="已发送引导">
						{visibleGuidance.map((item) => (
							<div key={item.id} className={styles.guidanceItem}>
								<div className={styles.guidanceItemBody}>
									<span className={styles.guidanceGrip} aria-hidden="true">⋮⋮</span>
									<Hint content={item.displayText}><span className={styles.guidanceItemText}>{item.displayText}</span></Hint>
									<span className={styles.guidanceItemStatus}>{guidanceStatusLabel(item.status)}</span>
								</div>
								<div className={styles.guidanceItemActions}>
									<Hint content="再次引导"><Button type="button" variant="secondary" size="sm" className={styles.guidanceAction} onClick={() => void replayGuidance(item, 'steer')} disabled={!isStreaming || submitting || isStopping || isFlushingGuidance}>
										<CornerUpRight size={13} /> 引导
									</Button></Hint>
									<Hint content="编辑后发送"><Button type="button" variant="ghost" size="icon-sm" className={styles.guidanceIconAction} onClick={() => editGuidance(item)} aria-label="编辑后发送">
										<Pencil size={14} />
									</Button></Hint>
									<Hint content="删除记录"><Button type="button" variant="ghost" size="icon-sm" className={styles.guidanceIconAction} onClick={() => removeGuidance(item.id)} aria-label="删除记录">
										<Trash2 size={14} />
									</Button></Hint>
								</div>
							</div>
						))}
					</div>
				)}
				{(attachments.length > 0 || preparing || prepareError) && (
					<div className={styles.attachments}>
						{attachments.map((a, idx) => (
							a.kind === 'work-item' ? (
								<Hint key={`${a.name}-${idx}`} content={a.workItem ? `${a.workItem.workItemCode} · ${a.name}` : a.name}><div className={`${styles.attachment} ${styles.workItemAttachment} ${a.workItem?.workItemType === '缺陷' ? styles.workItemAttachmentDefect : ''}`}>
									{a.workItem?.workItemType === '缺陷' ? <Bug size={13} /> : <ClipboardList size={13} />}
									<span className={styles.attachmentName}>{a.name}</span>
									<Hint content="移除"><Button type="button" variant="ghost" size="icon-sm" className={styles.attachmentRemove} onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} aria-label="移除工作项">
										<X size={12} />
									</Button></Hint>
								</div></Hint>
							) : (
								<Hint key={`${a.name}-${idx}`} content={a.warnings?.join('\n') || a.name}><div className={styles.attachment}>
									{a.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
									<span className={styles.attachmentName}>{a.name}</span>
									<span className={styles.attachmentSize}>{formatSize(a.sizeBytes)}</span>
									<Hint content="移除"><Button type="button" variant="ghost" size="icon-sm" className={styles.attachmentRemove} onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} aria-label={`移除附件 ${a.name}`}>
										<X size={12} />
									</Button></Hint>
								</div></Hint>
							)
						))}
						{preparing && (
							<div className={`${styles.attachment} ${styles.loading}`}>
								<Loader2 size={13} className={styles.spin} />
								<span>解析中…</span>
							</div>
						)}
						{prepareError && (
							<Hint content={prepareError}><div className={`${styles.attachment} ${styles.error}`}>
								<span>附件解析失败：{prepareError}</span>
								<Button type="button" variant="ghost" size="icon-sm" className={styles.attachmentRemove} onClick={() => setPrepareError(null)}>
									<X size={12} />
								</Button>
							</div></Hint>
						)}
					</div>
				)}
				<div className={styles.composerRow}>
					{/* 外层也挂编辑区样式，确保 Tiptap 重建内部 ProseMirror 根节点时不会短暂回到浏览器默认样式。 */}
					<EditorContent editor={editor} className={`${styles.editorShell} ${styles.editorSurface}`} onPaste={onPaste} />
				</div>
				<div className={styles.toolbar}>
					<div className={styles.actions}>
						<Hint content="添加附件或工作项"><Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => setAddMenuOpen((current) => !current)}
							className={styles.attach}
							data-add-menu-trigger="true"
							aria-label="添加附件或工作项"
							aria-expanded={addMenuOpen}
							disabled={isSessionLoading}
						>
							<Plus size={17} />
						</Button></Hint>
						<ModelPicker />
						{(isStreaming && hasComposerContent) ? (
							<Hint content="发送引导"><Button
								type="button"
								variant="default"
								size="icon"
								onClick={() => void send()}
								disabled={!canSend}
								className={styles.send}
								aria-label="发送引导"
							>
								<Send size={15} />
							</Button></Hint>
						) : isStreaming || isStopping ? (
							<Hint content="停止当前任务并取消未执行引导"><Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => void abort()}
								disabled={isStopping}
								className={`${styles.send} ${styles.stop}`}
								aria-label="停止当前任务并取消未执行引导"
							>
								<Square size={15} />
							</Button></Hint>
						) : (
							<Hint content="发送"><Button
								type="button"
								variant="default"
								size="icon"
								onClick={() => void send()}
								disabled={!canSend || isSessionLoading}
								className={styles.send}
							>
								<ArrowUp size={16} />
							</Button></Hint>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
