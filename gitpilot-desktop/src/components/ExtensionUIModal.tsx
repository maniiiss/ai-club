/**
 * 扩展 UI 请求模态。
 *
 * 处理 sidecar extension 发起的交互请求（select/input/editor），映射到 React 模态；
 * confirm 由 ExtensionUIConfirmCard 映射到输入框上方。对应设计文档第 7.1 节。
 * 始终处理队列首部请求，用户交互后通过 respondExtensionUI 回传结果。
 */
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Check, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import styles from './ExtensionUIModal.module.css';

type RespondValue = { value: string } | { confirmed: boolean } | { cancelled: true };

/** 将需求选择器的协议字符串拆成稳定的代码、名称和元信息，避免整行挤在一条按钮里。 */
function parseRequirementOption(option: string): { code: string; name: string; meta: string } | null {
	const match = option.match(/^\[([^\]]+)\]\s*(.*?)\s+·\s+(.+)$/);
	if (!match) return null;
	return { code: match[1], name: match[2].trim(), meta: match[3].trim() };
}

export function ExtensionUIModal() {
	const req = useSessionStore((s) => s.pendingExtensionUI[0] ?? null);
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const [value, setValue] = useState('');

	useEffect(() => {
		setValue(req?.method === 'editor' ? req.prefill ?? '' : '');
	}, [req]);

	if (!req || req.method === 'confirm') return null;

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
										<Button key={opt} type="button" variant="unstyled" size="default" className={`${styles.option} h-auto`} onClick={() => close({ value: opt })} title={opt}>
											{parsed ? <>
												<span className={styles.optionCode}>{parsed.code}</span>
												<span className={styles.optionCopy}><span className={styles.optionName}>{parsed.name}</span><span className={styles.optionMeta}>{parsed.meta}</span></span>
											</> : <span className={styles.optionName}>{opt}</span>}
										</Button>
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
	const req = useSessionStore((s) => s.pendingExtensionUI[0] ?? null);
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (req?.method === 'confirm') confirmRef.current?.focus();
	}, [req]);

	if (!req || req.method !== 'confirm') return null;

	return (
		<div className={styles.confirmCard} role="alertdialog" aria-modal="false" aria-labelledby="extension-confirm-title" aria-describedby="extension-confirm-message">
			<div className={styles.confirmHeader}>
				<CircleAlert size={15} aria-hidden="true" />
				<strong id="extension-confirm-title">{req.title}</strong>
			</div>
			<p id="extension-confirm-message" className={styles.confirmMessage}>{req.message}</p>
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
