/**
 * 输入区的模型与思维级别选择器。
 *
 * 平台对接全靠 sidecar 内 extension（见设计文档第 8 节）：
 * - 未登录（model.id === unknown）显示"登录"按钮，点击发送 /login 走设备授权
 * - 已登录显示当前模型，下拉切换平台 CHAT 模型
 * - 思维级别切换
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu, Brain, LogIn } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import type { ThinkingLevel } from '@/src/rpc/types';

/**
 * 只有一个启用档位的模型本质上是开关能力，例如 sidecar 回传 off/high。
 * UI 不暴露误导性的 high，而是显示 off/on；实际写回时仍使用模型支持的原始档位。
 */
export function isBinaryThinkingMode(levels: readonly ThinkingLevel[]): boolean {
	return levels.includes('off') && levels.filter((level) => level !== 'off').length === 1;
}

export interface ThinkingLevelOption {
	label: string;
	value: ThinkingLevel;
}

/** 根据模型能力生成显示选项，避免改变 sidecar 的真实 thinking level 协议。 */
export function getThinkingLevelOptions(levels: readonly ThinkingLevel[]): ThinkingLevelOption[] {
	if (!isBinaryThinkingMode(levels)) return levels.map((level) => ({ label: level, value: level }));
	const enabledLevel = levels.find((level) => level !== 'off');
	return enabledLevel ? [{ label: 'off', value: 'off' }, { label: 'on', value: enabledLevel }] : [];
}

/** 二元模型的任意启用档位在输入区统一显示为 on。 */
export function getThinkingLevelLabel(level: ThinkingLevel, levels: readonly ThinkingLevel[]): string {
	return isBinaryThinkingMode(levels) && level !== 'off' ? 'on' : level;
}

export function ModelPicker() {
	const sessionState = useSessionStore((s) => s.sessionState);
	const loggedIn = useSessionStore((s) => s.loggedIn);
	const models = useSessionStore((s) => s.models);
	const setModel = useSessionStore((s) => s.setModel);
	const setThinkingLevel = useSessionStore((s) => s.setThinkingLevel);
	const thinkingLevels = useSessionStore((s) => s.thinkingLevels);
	const prompt = useSessionStore((s) => s.prompt);
	const modelPickerRequest = useWorkbenchStore((s) => s.modelPickerRequest);

	const [openModel, setOpenModel] = useState(false);
	const [openThinking, setOpenThinking] = useState(false);
	const pickerRef = useRef<HTMLDivElement>(null);

	const currentModel = sessionState?.model;

	useEffect(() => {
		if (modelPickerRequest > 0) setOpenModel(true);
	}, [modelPickerRequest]);

	// 两个下拉均属于同一浮层组，点击其外侧空白区域或按 Esc 必须立即收起。
	useEffect(() => {
		if (!openModel && !openThinking) return;
		const dismiss = (event: PointerEvent) => {
			if (!pickerRef.current?.contains(event.target as Node)) {
				setOpenModel(false);
				setOpenThinking(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setOpenModel(false);
				setOpenThinking(false);
			}
		};
		document.addEventListener('pointerdown', dismiss);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', dismiss);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [openModel, openThinking]);

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

	// 可用思考级别由 sidecar 按当前模型能力给出；仅剩 off 表示该模型不支持 reasoning，需禁用控件。
	const thinkingSupported = thinkingLevels.some((lv) => lv !== 'off');
	const thinkingOptions = getThinkingLevelOptions(thinkingLevels);
	const currentThinkingLevel = sessionState?.thinkingLevel ?? 'off';

	return (
		<div ref={pickerRef} className="flex items-center gap-2">
			{/* 模型选择 */}
			<div className="relative">
				<button
					type="button"
					onClick={() => { setOpenModel((o) => !o); setOpenThinking(false); }}
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
					disabled={!thinkingSupported}
					title={thinkingSupported ? undefined : '当前模型不支持思考'}
					onClick={() => { setOpenThinking((o) => !o); setOpenModel(false); }}
					className={`flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs transition-colors ${
						thinkingSupported ? 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]' : 'cursor-not-allowed text-[var(--color-text-muted)]'
					}`}
				>
					<Brain size={13} />
					<span>{getThinkingLevelLabel(currentThinkingLevel, thinkingLevels)}</span>
					{thinkingSupported && <ChevronDown size={12} />}
				</button>
				{thinkingSupported && openThinking && (
					<div className="absolute bottom-full right-0 z-40 mb-1 w-32 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-lg">
						{thinkingOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => {
									setThinkingLevel(option.value);
									setOpenThinking(false);
								}}
								className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-primary-muted)] ${
									option.value === currentThinkingLevel ? 'text-[var(--color-primary-hover)]' : 'text-[var(--color-text-secondary)]'
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
