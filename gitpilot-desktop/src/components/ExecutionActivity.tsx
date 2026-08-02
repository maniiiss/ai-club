/** 聊天流内的 Agent 执行摘要，所有信息均来自已归并的 sidecar 真实事件。 */
import { useEffect, useState } from 'react';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { formatDuration, getUnreportedExecutionSteps, useWorkbenchStore, type ExecutionRun, type ExecutionStep } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { ChangedFileItem } from './ChangedFilesCard';
import type { ChangedFile } from '@/src/store/changed-files';
import styles from './ExecutionActivity.module.css';

export function getExecutionActivityLabel(execution: ExecutionRun, isStreaming: boolean): string | null {
	if (!isStreaming) return null;
	// 仅显示当前仍在执行的真实工具；没有活跃工具时按模型增量阶段判断。
	const activeTool = [...execution.steps].reverse().find((step) => step.status === 'running' || step.status === 'waiting');
	if (activeTool) return describeExecutionActivity(activeTool);
	// 正文已经在输出时模型处于回答阶段，由正文气泡本身体现进度，不再展示“正在思考”。
	if (execution.lastDeltaKind === 'text') return null;
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

/** 执行过程日志流：思考 + 每个步骤的标题与输出，按执行时间顺序。 */
function ExecutionTrace({ steps, thinking }: { steps: ExecutionStep[]; thinking?: string }) {
	const visible = steps.filter((s) => s.kind !== 'complete');
	if (!thinking?.trim() && visible.length === 0) return null;
	return (
		<div className={styles.trace}>
			{thinking?.trim() && (
				<div className={styles.thinkingBlock}>
					<span>思考</span>
					<pre>{thinking}</pre>
				</div>
			)}
			{visible.map((step) => {
				const output = step.error ?? step.result ?? step.partialResult ?? step.args;
				return (
					<div key={step.id} className={styles.traceStep}>
						<span className={styles.traceStepTitle}>{describeExecutionStep(step)}</span>
						{output && <pre className={styles.traceStepOutput}>{output}</pre>}
					</div>
				);
			})}
		</div>
	);
}

/**
 * 已完成执行批次。
 * 折叠态：总耗时 + 编辑文件列表（始终可见）。
 * 展开态：总耗时 + 执行过程日志流（思考+步骤+输出）+ 编辑文件列表。
 * 总结（助手正文）在 ExecutionBatch 外，不折叠。
 */
export function ExecutionBatch({ steps, thinking, durationMs, changedFiles }: {
	steps: ExecutionStep[];
	thinking?: string;
	durationMs?: number;
	changedFiles?: ChangedFile[];
}) {
	const [expanded, setExpanded] = useState(false);
	const hasFiles = Boolean(changedFiles && changedFiles.length > 0);
	return (
		<section className={`${styles.root} ${styles.batch}`} aria-label="已完成的 Agent 执行批次">
			<Button type="button" variant="ghost" size="sm" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
				<ChevronRight size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
				<span className={styles.duration}>总耗时 {formatDuration(durationMs ?? 0)}</span>
			</Button>
			<div className={styles.divider} />
			{expanded && (
				<>
					<span className={styles.sectionTitle}>执行过程</span>
					<ExecutionTrace steps={steps} thinking={thinking} />
				</>
			)}
			{hasFiles && (
				<>
					<span className={styles.sectionTitle}>编辑文件</span>
					<div className={styles.filesList}>
						{changedFiles!.map((file) => <ChangedFileItem key={file.path} file={file} />)}
					</div>
				</>
			)}
		</section>
	);
}

/** 运行中执行面板：实时计时 + 当前活动 + 可展开当前执行过程。 */
export function ExecutionActivity({ isStreaming }: { isStreaming: boolean }) {
	const execution = useWorkbenchStore((s) => s.execution);
	const [expanded, setExpanded] = useState(false);
	const label = getExecutionActivityLabel(execution, isStreaming);
	const visibleSteps = getUnreportedExecutionSteps(execution);
	const canExpand = Boolean(execution.thinking?.trim()) || visibleSteps.length > 0;

	// 新问题会生成新的执行 run，面板必须回到收起状态，不能沿用上一次用户展开的详情。
	useEffect(() => setExpanded(false), [execution.id]);
	// sidecar 未提供思考增量且没有工具步骤时，不保留一个可展开的空面板。
	useEffect(() => {
		if (!canExpand) setExpanded(false);
	}, [canExpand]);

	// 实时计时：运行中每秒刷新 now - startedAt。
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!isStreaming || !execution.startedAt) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [isStreaming, execution.startedAt]);
	const elapsed = execution.startedAt ? now - execution.startedAt : null;

	// 没有活动文案也没有计时时不渲染面板。
	if (!label && elapsed == null) return null;

	const isPending = label === '正在整理工具结果…' || label === '正在准备…';
	const activityLabel = isPending
		? <span className={`${styles.label} ${styles.running}`} role="status" title={label ?? ''}><LoaderCircle size={14} aria-hidden="true" className={styles.spinner} />{label}</span>
		: <span className={`${styles.label} ${styles.running}`} title={label ?? ''}>{label}</span>;

	return (
		<section className={styles.root} aria-label="Agent 执行过程">
			{elapsed != null && (
				<span className={`${styles.label} ${styles.running}`} role="status">
					<LoaderCircle size={14} aria-hidden="true" className={styles.spinner} />
					<span className={styles.timer}>运行中 {formatDuration(elapsed)}</span>
				</span>
			)}
			{label && (canExpand ? (
				<Button type="button" variant="ghost" size="sm" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
					<ChevronRight size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
					{activityLabel}
				</Button>
			) : <span className={`${styles.summary} ${styles.static}`} aria-live="polite">{activityLabel}</span>)}
			{canExpand && (
				<div className={`${styles.expanded} ${expanded ? styles.expandedOpen : ''}`} aria-hidden={!expanded} inert={!expanded}>
					<div className={styles.expandedInner}>
						<ExecutionTrace steps={visibleSteps} thinking={execution.thinking} />
					</div>
				</div>
			)}
		</section>
	);
}
