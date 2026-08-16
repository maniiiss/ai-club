/**
 * 扩展 UI 请求模态。
 *
 * 处理 sidecar extension 发起的交互请求（select/input/editor），映射到 React 模态；
 * confirm 由 ExtensionUIConfirmCard 映射到输入框上方。对应设计文档第 7.1 节。
 * 始终处理队列首部请求，用户交互后通过 respondExtensionUI 回传结果。
 */
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Check, CornerDownLeft, X } from 'lucide-react';
import { useSessionStore, useActiveExtensionUI } from '@/src/store/session';
import type { RpcExtensionUIRequest } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import styles from './ExtensionUIModal.module.css';

type RespondValue = { value: string } | { confirmed: boolean } | { cancelled: true };

type ConfirmRequest = Extract<RpcExtensionUIRequest, { method: 'confirm' }>;

/**
 * Goal 扩展的确认协议来自上游英文插件；仅适配固定的“替换目标”请求，
 * 保留用户填写的目标原文，并明确确认后当前目标会被停止，避免误操作。
 */
export function localizeGoalReplaceConfirmation(req: ConfirmRequest): Pick<ConfirmRequest, 'title' | 'message'> {
	if (req.title !== 'Replace goal?') return { title: req.title, message: req.message };
	const message = req.message
		.replace(/^Current goal:\s*/, '当前目标：')
		.replace(/\n\nQueued goals also removed:\n/, '\n\n以下排队目标也会被移除：\n')
		.replace(/\n\nNew goal:\s*/, '\n\n新目标：');
	return {
		title: '替换当前目标？',
		message: `${message}\n\n确认后，当前目标将停止，并立即开始执行新目标。`,
	};
}

/** 将需求选择器的协议字符串拆成稳定的代码、名称和元信息，避免整行挤在一条按钮里。 */
function parseRequirementOption(option: string): { code: string; name: string; meta: string } | null {
	const match = option.match(/^\[([^\]]+)\]\s*(.*?)\s+·\s+(.+)$/);
	if (!match) return null;
	return { code: match[1], name: match[2].trim(), meta: match[3].trim() };
}

/** 需求选择器（/requirement）的固定标题，与 session.ts respondExtensionUI 中的判断保持一致。 */
const REQUIREMENT_SELECT_TITLE = '选择要设计开发的需求';

type ActionSelectRequest = Extract<RpcExtensionUIRequest, { method: 'select' }>;

/**
 * 动作型 select 判定：选项是动作（如 plan 模式"下一步"）而非结构化需求条目。
 * 业务意图：动作型选择走输入框上方浮层（对齐 / 命令面板），需求选择器仍用全屏 Dialog 展示富信息。
 * 这里按标题排除需求选择器，避免依赖选项文本格式；与 respondExtensionUI 的标题判断同源。
 */
export function isActionSelect(req: RpcExtensionUIRequest | null | undefined): req is ActionSelectRequest {
	return !!req && req.method === 'select' && req.title !== REQUIREMENT_SELECT_TITLE;
}

/**
 * 支持"其他"自定义反馈的动作型 select 标题。
 * 仅 plan-mode 的计划确认菜单（showReadyPlanMenu / showPlanModeMenu）在本地 fork 后识别自定义 choice；
 * 其他 plan-mode 菜单（Plan-mode tools / Active implementation plan / Saved plan）仍走 runMenu，
 * 自定义 choice 会触发 runDialogMenu 的 label 匹配失败重弹，故不显示"其他"输入框。
 * 与 gitpilot-cli/src/extensions/plan-mode/plan-action-menus.ts 的 ctx.ui.select title 保持同步。
 */
const FEEDBACK_SELECT_TITLES = new Set(['计划已就绪，下一步？', '计划模式']);

export function ExtensionUIModal() {
	const req = useActiveExtensionUI();
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const [value, setValue] = useState('');

	useEffect(() => {
		setValue(req?.method === 'editor' ? req.prefill ?? '' : '');
	}, [req]);

	// 动作型 select（非需求选择器）交给输入框上方浮层；需求选择器仍在此模态渲染。
	// 此处用内联判断而非 isActionSelect 类型守卫，避免把需求选择器也从 req 类型中收窄掉。
	if (!req || req.method === 'confirm' || (req.method === 'select' && req.title !== REQUIREMENT_SELECT_TITLE)) return null;

	// 联合类型中仅 select/input/editor 含 title，统一安全取值
	const title = (req as { title?: string }).title ?? '请求输入';

	const close = (result: RespondValue) => {
		respond(req, result);
	};

	return (
		<Dialog open onOpenChange={(open) => { if (!open) close({ cancelled: true }); }}>
			<DialogContent className={styles.content} aria-describedby="extension-ui-description">
				<DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription id="extension-ui-description">选择一条需求开始技术设计与开发</DialogDescription></DialogHeader>
				<div className="px-5 pb-5 pt-3">
					{req.method === 'select' && (
						<div className={styles.optionScroll}>
							<div className={styles.optionList}>
								{req.options.map((opt) => {
									const parsed = parseRequirementOption(opt);
									return (
										<Hint key={opt} content={opt}><Button type="button" variant="unstyled" size="default" className={`${styles.option} h-auto`} onClick={() => close({ value: opt })}>
											{parsed ? <>
												<span className={styles.optionCode}>{parsed.code}</span>
												<span className={styles.optionCopy}><span className={styles.optionName}>{parsed.name}</span><span className={styles.optionMeta}>{parsed.meta}</span></span>
											</> : <span className={styles.optionName}>{opt}</span>}
										</Button></Hint>
									);
								})}
							</div>
						</div>
					)}

					{req.method === 'input' && (
						<Input
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder={req.placeholder}
							onKeyDown={(e) => {
								if (e.key === 'Enter') close({ value });
							}}
							className="bg-[var(--background)]"
						/>
					)}

					{req.method === 'editor' && (
						<Textarea
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							rows={12}
							className="min-h-48 resize-y bg-[var(--gp-code-surface)] font-mono text-xs"
						/>
					)}
				</div>

				{(req.method === 'input' || req.method === 'editor') && (
					<DialogFooter>
						<>
							<Button variant="ghost" onClick={() => close({ cancelled: true })}>取消</Button>
							<Button
								onClick={() => close({ value })}
								disabled={req.method === 'input' && !value}
							>
								提交
							</Button>
						</>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * 内嵌确认请求，复用输入框的悬浮层位置。
 * 业务意图：确认是当前输入动作的前置决策，不应遮挡整个工作台或改变对话上下文。
 */
export function ExtensionUIConfirmCard() {
	const req = useActiveExtensionUI();
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (req?.method === 'confirm') confirmRef.current?.focus();
	}, [req]);

	if (!req || req.method !== 'confirm') return null;
	const display = localizeGoalReplaceConfirmation(req);

	return (
		<div className={styles.confirmCard} role="alertdialog" aria-modal="false" aria-labelledby="extension-confirm-title" aria-describedby="extension-confirm-message">
			<div className={styles.confirmHeader}>
				<CircleAlert size={15} aria-hidden="true" />
				<strong id="extension-confirm-title">{display.title}</strong>
			</div>
			<p id="extension-confirm-message" className={styles.confirmMessage}>{display.message}</p>
			<div className={styles.confirmActions}>
				<Button type="button" variant="ghost" size="sm" onClick={() => respond(req, { confirmed: false })}>
					<X size={14} aria-hidden="true" />
					取消
				</Button>
				<Button type="button" size="sm" onClick={() => respond(req, { confirmed: true })} ref={confirmRef}>
					<Check size={14} aria-hidden="true" />
					确认
				</Button>
			</div>
		</div>
	);
}

/**
 * 动作型选择浮层，复用输入框的悬浮层位置（对齐 / 命令面板）。
 * 业务意图：plan 模式"下一步"这类动作选择是当前输入动作的前置决策，
 * 不应遮挡整个工作台；选项少且为纯文本动作，适合输入框正上方列表。
 */
/** "手动输入"选项标签：选中后浮层切换为输入模式，收集用户自定义反馈。 */
const MANUAL_INPUT_LABEL = '手动输入反馈';

export function ExtensionUISelectCard() {
	const req = useActiveExtensionUI();
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const [active, setActive] = useState(0);
	const [inputMode, setInputMode] = useState(false);
	const [otherText, setOtherText] = useState('');
	const activeRef = useRef(0);
	const panelRef = useRef<HTMLDivElement>(null);
	const otherInputRef = useRef<HTMLInputElement>(null);
	/** 输入模式下的当前文本，供全局键盘监听读取最新值。 */
	const otherTextRef = useRef('');
	/** 输入模式同步到 ref，供全局键盘监听（闭包不随 inputMode 重注册）读取最新值。 */
	const inputModeRef = useRef(false);
	inputModeRef.current = inputMode;
	/** 一次请求只允许响应一次，防止键盘与点击/多次回车竞态导致 sidecar 收到重复回包。 */
	const respondedRef = useRef(false);

	// 请求切换时重置高亮、输入模式与响应标记，避免跨请求残留。
	useEffect(() => {
		respondedRef.current = false;
		activeRef.current = 0;
		otherTextRef.current = '';
		setActive(0);
		setOtherText('');
		setInputMode(false);
	}, [req?.id]);

	const respondOnce = (value: RespondValue) => {
		// req 理论上仅在 isActionSelect 守卫通过后调用；null 时直接忽略，避免类型与运行时风险。
		if (respondedRef.current || !req) return;
		respondedRef.current = true;
		void respond(req, value);
	};

	// 全局键盘：选项模式 Esc 取消、↑↓ 移动、Enter 选中（"手动输入"切换输入模式）；
	// 输入模式 Enter 提交、Esc 返回选项。不因点击外部而关闭--动作型选择是当前回合前置决策。
	useEffect(() => {
		if (!isActionSelect(req)) return;
		const showManualInput = FEEDBACK_SELECT_TITLES.has(req.title);
		const allOptions = showManualInput ? [...req.options, MANUAL_INPUT_LABEL] : req.options;
		const onKey = (e: KeyboardEvent) => {
			if (inputModeRef.current) {
				// 输入模式：Enter 提交自定义文本，Esc 返回选项列表，其余键交给输入框默认行为。
				if (e.key === 'Enter') {
					e.preventDefault();
					const text = otherTextRef.current.trim();
					if (text) respondOnce({ value: text });
				} else if (e.key === 'Escape') {
					e.preventDefault();
					setInputMode(false);
				}
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				respondOnce({ cancelled: true });
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(activeRef.current + 1, Math.max(0, allOptions.length - 1));
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const next = Math.max(activeRef.current - 1, 0);
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const opt = allOptions[activeRef.current];
				if (opt === MANUAL_INPUT_LABEL) {
					setInputMode(true);
				} else if (opt) {
					respondOnce({ value: opt });
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [req, respond]);

	// 进入输入模式时聚焦输入框。
	useEffect(() => {
		if (inputMode) otherInputRef.current?.focus();
	}, [inputMode]);

	if (!isActionSelect(req)) return null;
	// "手动输入"选项仅对支持自定义 choice 的 plan 确认菜单追加（避免 runMenu 菜单死循环）。
	const showManualInput = FEEDBACK_SELECT_TITLES.has(req.title);
	const allOptions = showManualInput ? [...req.options, MANUAL_INPUT_LABEL] : req.options;

	// 输入模式：输入框 + 回车提交 + Esc 返回选项。
	if (inputMode) {
		return (
			<div ref={panelRef} className={styles.selectCard} role="dialog" aria-label={req.title}>
				<div className={styles.selectHeader}>{req.title}</div>
				<div className={styles.selectOther}>
					<input
						ref={otherInputRef}
						type="text"
						className={styles.selectOtherInput}
						value={otherText}
						placeholder="输入对计划的反馈…（回车提交）"
						onChange={(e) => { otherTextRef.current = e.target.value; setOtherText(e.target.value); }}
						aria-label="自定义反馈"
					/>
				</div>
				<div className={styles.selectFooter}>
					<CornerDownLeft size={11} aria-hidden="true" /> 提交 · Esc 返回
				</div>
			</div>
		);
	}

	return (
		<div ref={panelRef} className={styles.selectCard} role="listbox" aria-label={req.title}>
			<div className={styles.selectHeader}>{req.title}</div>
			<div className={styles.selectList}>
				{allOptions.map((opt, i) => (
					<button
						key={opt}
						type="button"
						className={`${styles.selectItem} ${i === active ? styles.selectItemActive : ''}`}
						onMouseEnter={() => { activeRef.current = i; setActive(i); }}
						onClick={() => {
							if (opt === MANUAL_INPUT_LABEL) {
								setInputMode(true);
							} else {
								respondOnce({ value: opt });
							}
						}}
					>
						<span>{opt}</span>
					</button>
				))}
			</div>
			<div className={styles.selectFooter}>
				<CornerDownLeft size={11} aria-hidden="true" /> 选择 · ↑↓ 移动 · Esc 取消
			</div>
		</div>
	);
}
