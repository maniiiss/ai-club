/**
 * 输入区的模型与思维级别选择器。
 *
 * 平台对接全靠 sidecar 内 extension（见设计文档第 8 节）：
 * - 未登录（model.id === unknown）显示"登录"按钮，点击发送 /login 走设备授权
 * - 已登录显示当前模型，下拉切换平台 CHAT 模型
 * - 思维级别切换
 */
import { useEffect, useState } from 'react';
import { Brain, CaretDown, Cpu, SignIn } from '@phosphor-icons/react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import type { ModelInfo, ThinkingLevel } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { Command as CommandRoot, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/src/components/ui/command';
import styles from './ModelPicker.module.css';

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

/** 平台模型能力已映射到 PI Model.input，只有明确包含 image 时才展示多模态标签。 */
export function isMultimodalModel(model: Pick<ModelInfo, 'input'>): boolean {
	return model.input?.includes('image') ?? false;
}

/** 仅供模型下拉列表展示计费方案；当前已选模型按钮不显示该标签。 */
export function getModelBillingLabel(model: Pick<ModelInfo, 'billingMultiplier'>): string {
	const multiplier = model.billingMultiplier;
	if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) return 'free';
	const value = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
	return `${value}x`;
}

/** Design 入口空间有限时只保留模型选择，其他工作区继续显示思考级别。 */
export function ModelPicker({ showThinkingLevel = true }: { showThinkingLevel?: boolean }) {
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

	const currentModel = sessionState?.model;

	useEffect(() => {
		if (modelPickerRequest > 0) setOpenModel(true);
	}, [modelPickerRequest]);

	// 登录态以 store.loggedIn 为准（登录流程标记），不依赖 sessionState.model（未选模型时为 unknown，会导致已登录仍显示"登录平台"）
	if (!loggedIn) {
		return (
			<Button
				type="button"
				variant="default"
				size="sm"
				onClick={() => prompt('/login')}
			>
				<SignIn weight="regular" size={14} /> 登录平台
			</Button>
		);
	}

	// 可用思考级别由 sidecar 按当前模型能力给出；仅剩 off 表示该模型不支持 reasoning，需禁用控件。
	const thinkingSupported = thinkingLevels.some((lv) => lv !== 'off');
	const thinkingOptions = getThinkingLevelOptions(thinkingLevels);
	const currentThinkingLevel = sessionState?.thinkingLevel ?? 'off';

	return (
		<div className={styles.picker}>
			{/* 模型选择 */}
			<Popover open={openModel} onOpenChange={(value) => { setOpenModel(value); if (value) setOpenThinking(false); }}>
				<PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.modelTrigger} focus-visible:outline-none focus-visible:ring-0`}><Cpu weight="regular" /><span className={styles.modelName}>{currentModel?.name ?? '未选择'}</span><CaretDown weight="bold" /></Button></PopoverTrigger>
				<PopoverContent side="top" align="start" className={styles.modelPopover}>
					<CommandRoot>
					<CommandInput placeholder="搜索模型…" containerClassName={styles.search} className={styles.searchInput} style={{ outline: 'none', border: 'none', boxShadow: 'none' }} />
						<CommandList className={styles.modelList}><CommandEmpty>{models.length === 0 ? '加载中…' : '没有匹配的模型'}</CommandEmpty>{models.map((m) => <CommandItem key={`${m.provider}:${m.id}`} value={`${m.name} ${m.provider}`} onSelect={() => { setModel(m.provider, m.id); setOpenModel(false); }} className={`${styles.modelItem} ${m.id === currentModel?.id ? styles.selected : ''}`}><span className={styles.modelCopy}><span className={styles.modelTitle}><span className={styles.modelTitleText}>{m.name}</span><span className={styles.modelBadges}>{isMultimodalModel(m) && <span className={styles.multimodalBadge}>多模态</span>}<span className={styles.billingBadge}>{getModelBillingLabel(m)}</span></span></span><small>{m.provider}</small></span></CommandItem>)}</CommandList>
					</CommandRoot>
				</PopoverContent>
			</Popover>

			{showThinkingLevel && <DropdownMenu open={openThinking} onOpenChange={(value) => { setOpenThinking(value); if (value) setOpenModel(false); }}>
				<Hint content={thinkingSupported ? undefined : '当前模型不支持思考'}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.thinkingTrigger} focus-visible:outline-none focus-visible:ring-0`} disabled={!thinkingSupported}><Brain weight="regular" /><span>{getThinkingLevelLabel(currentThinkingLevel, thinkingLevels)}</span>{thinkingSupported && <CaretDown weight="bold" />}</Button></DropdownMenuTrigger></Hint>
				<DropdownMenuContent side="top" align="end" className="w-32">
					<DropdownMenuLabel>思维级别</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{thinkingOptions.map((option) => <DropdownMenuItem key={option.value} onSelect={() => setThinkingLevel(option.value)} className={option.value === currentThinkingLevel ? 'bg-[var(--primary-muted)] text-[var(--primary)]' : ''}>{option.label}</DropdownMenuItem>)}
				</DropdownMenuContent>
			</DropdownMenu>}
		</div>
	);
}
