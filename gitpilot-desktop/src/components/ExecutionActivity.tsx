/** 聊天流内的 Agent 执行摘要，所有信息均来自已归并的 sidecar 真实事件。 */
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkbenchStore, type ExecutionRun, type ExecutionStep } from '@/src/store/workbench';

export function getExecutionActivityLabel(execution: ExecutionRun, isStreaming: boolean): string | null {
	if (!isStreaming) return null;
	// 仅显示当前仍在执行的真实工具；没有活跃工具时回退为思考状态。
	const activeTool = [...execution.steps].reverse().find((step) => step.status === 'running' || step.status === 'waiting');
	return activeTool ? describeExecutionActivity(activeTool) : '正在思考';
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

/** 展开后显示完整步骤；步骤区域固定最多五行高度，更多步骤可独立滚动。 */
export function ExecutionActivity({ isStreaming }: { isStreaming: boolean }) {
	const execution = useWorkbenchStore((s) => s.execution);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const selectStep = useWorkbenchStore((s) => s.selectStep);
	const [expanded, setExpanded] = useState(false);
	const label = getExecutionActivityLabel(execution, isStreaming);
	const visibleSteps = execution.steps.filter((step) => step.kind !== 'complete');
	const selected = visibleSteps.find((step) => step.id === selectedStepId) ?? visibleSteps.at(-1);
	const canExpand = canExpandExecutionActivity(execution);

	// 新问题会生成新的执行 run，面板必须回到收起状态，不能沿用上一次用户展开的详情。
	useEffect(() => setExpanded(false), [execution.id]);
	// sidecar 未提供思考增量且没有工具步骤时，不保留一个可展开的空面板。
	useEffect(() => {
		if (!canExpand) setExpanded(false);
	}, [canExpand]);

	if (!label) return null;

	return (
		<section className="chat-execution" aria-label="Agent 执行过程">
			{canExpand ? (
				<button type="button" className="chat-execution__summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
					{expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
					<span className="chat-execution__label is-running">{label}</span>
				</button>
			) : <span className="chat-execution__summary is-static" aria-live="polite"><span className="chat-execution__label is-running">{label}</span></span>}
			{expanded && (
				<div className="chat-execution__expanded">
					{visibleSteps.length === 0 ? <div className="chat-execution__thinking">
						<span className="chat-execution__thinking-title">思考过程</span>
						<pre>{execution.thinking}</pre>
					</div> : <>
						<div className="chat-execution__steps" aria-label="执行步骤">
							{visibleSteps.map((step) => (
								<button key={step.id} type="button" onClick={() => selectStep(step.id)} className={`chat-execution__step ${selected?.id === step.id ? 'is-selected' : ''}`}>
									<span>{describeExecutionStep(step)}</span>
								</button>
							))}
						</div>
						{selected && <div className="chat-execution__detail">
							<span className="chat-execution__detail-title">{selected.kind === 'command' ? 'Shell' : selected.title || '工具输出'}</span>
							<pre>{selected.error ?? selected.result ?? selected.partialResult ?? selected.args ?? ''}</pre>
						</div>}
					</>}
				</div>
			)}
		</section>
	);
}
