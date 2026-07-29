/**
 * 输入区的模型与思维级别选择器。
 *
 * 平台对接全靠 sidecar 内 extension（见设计文档第 8 节）：
 * - 未登录（model.id === unknown）显示"登录"按钮，点击发送 /login 走设备授权
 * - 已登录显示当前模型，下拉切换平台 CHAT 模型
 * - 思维级别切换
 */
import { useState } from 'react';
import { ChevronDown, Cpu, Brain, LogIn } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import type { ThinkingLevel } from '@/src/rpc/types';

export function ModelPicker() {
	const sessionState = useSessionStore((s) => s.sessionState);
	const loggedIn = useSessionStore((s) => s.loggedIn);
	const models = useSessionStore((s) => s.models);
	const setModel = useSessionStore((s) => s.setModel);
	const setThinkingLevel = useSessionStore((s) => s.setThinkingLevel);
	const prompt = useSessionStore((s) => s.prompt);

	const [openModel, setOpenModel] = useState(false);
	const [openThinking, setOpenThinking] = useState(false);

	const currentModel = sessionState?.model;

	// 登录态以 store.loggedIn 为准（登录流程标记），不依赖 sessionState.model（未选模型时为 unknown，会导致已登录仍显示"登录平台"）
	if (!loggedIn) {
		return (
			<button
				type="button"
				onClick={() => prompt('/login')}
				className="flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[var(--color-primary-hover)]"
			>
				<LogIn size={13} /> 登录平台
			</button>
		);
	}

	const levels: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];

	return (
		<div className="flex items-center gap-2">
			{/* 模型选择 */}
			<div className="relative">
				<button
					type="button"
					onClick={() => setOpenModel((o) => !o)}
					className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
				>
					<Cpu size={13} />
					<span className="max-w-40 truncate">{currentModel?.name ?? '未选择'}</span>
					<ChevronDown size={12} />
				</button>
				{openModel && (
					<div className="absolute bottom-full left-0 z-40 mb-1 max-h-72 w-56 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-lg">
						{models.length === 0 ? (
							<div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">加载中…</div>
						) : (
							models.map((m) => (
								<button
									key={`${m.provider}:${m.id}`}
									type="button"
									onClick={() => {
										setModel(m.provider, m.id);
										setOpenModel(false);
									}}
									className={`block w-full truncate px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-primary-muted)] ${
										m.id === currentModel?.id ? 'text-[var(--color-primary-hover)]' : 'text-[var(--color-text-secondary)]'
									}`}
								>
									<div className="truncate">{m.name}</div>
									<div className="truncate text-[10px] text-[var(--color-text-muted)]">{m.provider}</div>
								</button>
							))
						)}
					</div>
				)}
			</div>

			{/* 思维级别 */}
			<div className="relative">
				<button
					type="button"
					onClick={() => setOpenThinking((o) => !o)}
					className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
				>
					<Brain size={13} />
					<span>{sessionState?.thinkingLevel ?? 'off'}</span>
					<ChevronDown size={12} />
				</button>
				{openThinking && (
					<div className="absolute bottom-full right-0 z-40 mb-1 w-32 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-lg">
						{levels.map((lv) => (
							<button
								key={lv}
								type="button"
								onClick={() => {
									setThinkingLevel(lv);
									setOpenThinking(false);
								}}
								className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-primary-muted)] ${
									lv === sessionState?.thinkingLevel ? 'text-[var(--color-primary-hover)]' : 'text-[var(--color-text-secondary)]'
								}`}
							>
								{lv}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
