/** 聊天流内的 Agent 执行摘要，所有信息均来自已归并的 sidecar 真实事件。 */
import { useEffect, useState } from 'react';
import { Brain, CaretRight, CheckCircle, FileMagnifyingGlass, ListChecks, NotePencil, TerminalWindow, Wrench, type Icon } from '@phosphor-icons/react';
import { formatDuration, getUnreportedExecutionSteps, useWorkbenchStore, type ExecutionRun, type ExecutionStep } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './ExecutionActivity.module.css';

export function getExecutionActivityLabel(execution: ExecutionRun, isStreaming: boolean): string | null {
	if (execution.phase === 'compacting') return '正在压缩上下文';
	if (execution.compactionNotice === 'success') return '上下文已压缩';
	if (execution.compactionNotice === 'failure') return '上下文压缩失败';
	if (!isStreaming) return null;
	// 仅显示当前仍在执行的真实工具；没有活跃工具时按模型增量阶段判断。
	const activeTool = [...execution.steps].reverse().find((step) => step.status === 'running' || step.status === 'waiting');
	if (activeTool) return describeExecutionActivity(activeTool);
	const hasUnreportedTrace = Boolean(execution.thinking?.trim()) || getUnreportedExecutionSteps(execution).length > 0;
	// 正文已经开始输出时仍保留尚未归档的思考/工具痕迹，避免工具刚结束就从界面消失。
	// 纯正文回答没有执行痕迹时继续隐藏，避免每个普通回答都显示冗余状态。
	if (execution.lastDeltaKind === 'text') return hasUnreportedTrace ? '执行过程' : null;
	// thinking 文本是本次任务的历史记录；只有最近事件仍是 thinking_delta 时才表示模型正在思考。
	// 工具已结束但正文尚未到达时，模型正在根据工具结果组织下一轮请求；显式说明该等待，不能回退成旧思考或无文字的转圈。
	if (execution.lastDeltaKind === 'tool') return '正在整理工具结果…';
	return execution.lastDeltaKind === 'thinking' && execution.thinking?.trim() ? '正在思考' : '正在准备…';
}

/** 从真实工具参数中提取用户可读的操作对象，例如 read 的文件路径。 */
function executionTarget(step: ExecutionStep): string | null {
	let args: Record<string, unknown> | null = null;
	try {
		const parsed = step.args ? JSON.parse(step.args) : null;
		args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
	} catch {}
	const target = args?.path ?? args?.filePath ?? args?.file ?? args?.command ?? args?.query ?? args?.pattern;
	return typeof target === 'string' && target ? target : null;
}

/** 供展开历史列表使用的紧凑工具描述。 */
export function describeExecutionStep(step: ExecutionStep): string {
	const target = executionTarget(step);
	const name = step.title || step.kind;
	return target ? `${name} ${target}` : name;
}

/** 聊天流顶部的实时工具文案，保留 sidecar 原始工具名以兼容未来扩展。 */
export function describeExecutionActivity(step: ExecutionStep): string {
	const target = executionTarget(step);
	const name = step.title || step.kind;
	return target ? `${name} ${target}` : name;
}

/** 只有存在真实思考文本或工具步骤时，才允许用户展开执行详情。 */
export function canExpandExecutionActivity(execution: ExecutionRun): boolean {
	return Boolean(execution.thinking?.trim()) || execution.steps.some((step) => step.kind !== 'complete');
}

/** 将一批工具步骤归纳为紧凑摘要（保留导出，历史调用方可能依赖）。 */
export function describeExecutionBatch(steps: ExecutionStep[]): string {
	const countByKind = new Map<ExecutionStep['kind'], number>();
	for (const step of steps) countByKind.set(step.kind, (countByKind.get(step.kind) ?? 0) + 1);
	const labels: string[] = [];
	const append = (kind: ExecutionStep['kind'], text: string) => {
		const count = countByKind.get(kind);
		if (count) labels.push(`${text}${count}个${kind === 'edit' ? '文件' : kind === 'verify' ? '项验证' : kind === 'command' ? '命令' : '操作'}`);
	};
	append('command', '运行了');
	append('edit', '编辑了');
	append('read', '读取了');
	append('verify', '完成了');
	const otherCount = (countByKind.get('plan') ?? 0) + (countByKind.get('other') ?? 0);
	if (otherCount) labels.push(`调用了${otherCount}个工具`);
	return labels.length > 0 ? labels.join('、') : `调用了${steps.length}个工具`;
}

/** 按步骤类型匹配功能图标，使用统一的 Phosphor 扁平化图标风格。 */
function ExecutionStepIcon({ kind }: { kind: ExecutionStep['kind'] }) {
	const map: Partial<Record<ExecutionStep['kind'], Icon>> = {
		read: FileMagnifyingGlass, edit: NotePencil, command: TerminalWindow, verify: CheckCircle, plan: ListChecks, other: Wrench,
	};
	const Icon = map[kind] ?? Wrench;
	return <Icon weight="regular" size={13} aria-hidden="true" className={styles.traceStepIcon} />;
}

/** 思考块：默认只显示标题，点击展开思考内容（执行过程详情默认收起）。 */
function ThinkingBlock({ thinking }: { thinking: string }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className={styles.traceStep}>
			<span className={styles.traceStepTitle} role="button" tabIndex={0} onClick={() => setExpanded((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}>
				<Brain weight="regular" size={13} aria-hidden="true" className={styles.traceStepIcon} />
					<span className={styles.traceStepText}>思考过程</span>
			</span>
			{expanded && <pre className={styles.traceStepOutput}>{thinking}</pre>}
		</div>
	);
}

/** 单个执行步骤：默认只显示标题，点击展开输出。 */
function TraceStep({ step }: { step: ExecutionStep }) {
	const [expanded, setExpanded] = useState(false);
	const output = step.error ?? step.result ?? step.partialResult ?? step.args;
	const hasOutput = Boolean(output);
	return (
		<div className={styles.traceStep}>
			<span
				className={styles.traceStepTitle}
				role={hasOutput ? 'button' : undefined}
				tabIndex={hasOutput ? 0 : undefined}
				onClick={hasOutput ? () => setExpanded((v) => !v) : undefined}
				onKeyDown={hasOutput ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } } : undefined}
			>
				<ExecutionStepIcon kind={step.kind} />
				<span className={styles.traceStepText}>{describeExecutionStep(step)}</span>
			</span>
			{expanded && output && <pre className={styles.traceStepOutput}>{output}</pre>}
		</div>
	);
}

/** 执行过程日志流中的单项：思考、步骤、正文片段或改动文件，按真实输出顺序交错。 */
export type TraceItem =
	| { type: 'thinking'; text: string }
	| { type: 'step'; step: ExecutionStep }
	| { type: 'text'; text: string };

/** 执行过程日志流：按真实输出顺序交错思考/步骤/正文；改动文件只在最终结果卡展示。 */
function ExecutionTrace({ items }: { items: TraceItem[] }) {
	if (items.length === 0) return null;
	return (
		<div className={styles.trace}>
			{items.map((item, index) => {
				switch (item.type) {
					case 'thinking':
						return <ThinkingBlock key={`t-${index}`} thinking={item.text} />;
					case 'step':
						return <TraceStep key={item.step.id ?? `s-${index}`} step={item.step} />;
					case 'text':
						return <div key={`p-${index}`} className={styles.progressText}>{item.text}</div>;
				}
			})}
		</div>
	);
}

/**
 * 已完成执行批次：折叠标题直接说明真实操作，避免使用没有信息量的“执行过程”占位文案。
 * 总结（助手正文）在 ExecutionBatch 外，不折叠。
 */
export function ExecutionBatch({ steps, thinking }: {
	steps: ExecutionStep[];
	thinking?: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const summaryLabel = steps.length === 1 ? describeExecutionStep(steps[0]) : describeExecutionBatch(steps);
	const items: TraceItem[] = [];
	if (thinking?.trim()) items.push({ type: 'thinking', text: thinking.trim() });
	for (const step of steps) if (step.kind !== 'complete') items.push({ type: 'step', step });
	return (
		<section className={styles.root} aria-label="已完成的 Agent 执行批次">
			<Button type="button" variant="unstyled" size="sm" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
				<CaretRight weight="bold" size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
				<span className={styles.label}>{summaryLabel}</span>
			</Button>
			{expanded && <ExecutionTrace items={items} />}
		</section>
	);
}

/** 根据当前执行状态生成固定头部文案；完成后在原位置把“运行中”替换为“总耗时”。 */
export function getExecutionTimingLabel(isRunning: boolean, startedAt: number | undefined, durationMs: number | undefined, now: number): string | null {
	if (isRunning && startedAt != null) return `运行中 ${formatDuration(Math.max(0, now - startedAt))}`;
	if (!isRunning && durationMs != null) return `总耗时 ${formatDuration(Math.max(0, durationMs))}`;
	return null;
}

/** 运行状态头固定在对应用户请求之后；完成后可在总耗时下展开整轮执行详情。 */
export function ExecutionTimer({ isRunning, startedAt, durationMs, items = [], isCollapsing = false }: {
	isRunning: boolean;
	startedAt?: number;
	durationMs?: number;
	items?: TraceItem[];
	isCollapsing?: boolean;
}) {
	const [now, setNow] = useState(Date.now);
	const [expanded, setExpanded] = useState(false);
	useEffect(() => {
		if (!isRunning || startedAt == null) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [isRunning, startedAt]);
	useEffect(() => {
		if (isRunning) setExpanded(false);
	}, [isRunning]);
	const label = getExecutionTimingLabel(isRunning, startedAt, durationMs, now);
	if (!label) return null;
	const canExpand = !isRunning && items.length > 0;
	const statusLabel = <span className={`${styles.label} ${isRunning ? styles.running : ''}`}>{label}</span>;

	return (
		<section className={`${styles.root} ${isCollapsing ? styles.settling : ''}`} aria-label={isRunning ? 'Agent 运行计时' : 'Agent 总耗时'}>
			{canExpand ? (
				<Button type="button" variant="unstyled" size="sm" className={styles.summary} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
					<CaretRight weight="bold" size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
					{statusLabel}
				</Button>
			) : (
				<span className={styles.statusLine} role="status"><span className={styles.timer}>{statusLabel}</span></span>
			)}
			{canExpand && expanded && <ExecutionTrace items={items} />}
			<div className={styles.divider} />
		</section>
	);
}

/**
 * 当前思考或工具活动跟随最新正文向下推进，可展开查看尚未归档的执行过程。
 * execution 参数允许 Work 等其他模式注入自己的运行态；缺省时读取 Code 工作台 store。
 */
export function ExecutionActivity({ isStreaming, execution: executionOverride }: { isStreaming: boolean; execution?: ExecutionRun }) {
	const storeExecution = useWorkbenchStore((s) => s.execution);
	const execution = executionOverride ?? storeExecution;
	const [expanded, setExpanded] = useState(false);
	const label = getExecutionActivityLabel(execution, isStreaming);
	const visibleSteps = getUnreportedExecutionSteps(execution);
	// 只允许展开当前正文尚未归档的步骤；已归档批次已经在聊天时间线中展示。
	const canExpand = Boolean(execution.thinking?.trim()) || visibleSteps.length > 0;
	const liveItems: TraceItem[] = [];
	if (execution.thinking?.trim()) liveItems.push({ type: 'thinking', text: execution.thinking.trim() });
	for (const step of visibleSteps) liveItems.push({ type: 'step', step });

	// 新问题会生成新的执行 run，面板必须回到收起状态，不能沿用上一次用户展开的详情。
	useEffect(() => setExpanded(false), [execution.id]);
	// sidecar 未提供思考增量且没有工具步骤时，不保留一个可展开的空面板。
	useEffect(() => {
		if (!canExpand) setExpanded(false);
	}, [canExpand]);

	if (!label) return null;

	const isPending = label === '正在整理工具结果…' || label === '正在准备…';
	const activityLabel = (
		<Hint content={label}><span className={`${styles.label} ${styles.running}`} role={isPending ? 'status' : undefined}>{label}</span></Hint>
	);

	return (
		<section className={styles.root} aria-label="Agent 执行过程">
			{canExpand ? (
				<Button type="button" variant="unstyled" size="sm" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
					<CaretRight weight="bold" size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
					{activityLabel}
				</Button>
			) : <span className={`${styles.summary} ${styles.static}`} aria-live="polite">{activityLabel}</span>}
			{canExpand && (
				<div className={`${styles.expanded} ${expanded ? styles.expandedOpen : ''}`} aria-hidden={!expanded} inert={!expanded}>
					<div className={styles.expandedInner}>
						<ExecutionTrace items={liveItems} />
					</div>
				</div>
			)}
		</section>
	);
}
