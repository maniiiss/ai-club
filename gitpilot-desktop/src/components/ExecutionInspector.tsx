/** 真实 sidecar 工具事件的时间线与详情查看器。 */
import { Check, CircleDot, FilePenLine, FileSearch, Play, RotateCcw, Terminal, TriangleAlert, Wrench } from 'lucide-react';
import { useWorkbenchStore, type ExecutionKind, type ExecutionStep } from '@/src/store/workbench';

const ICONS: Record<ExecutionKind, typeof CircleDot> = {
	plan: CircleDot,
	read: FileSearch,
	edit: FilePenLine,
	command: Terminal,
	verify: Check,
	complete: Check,
	other: Wrench,
};

function duration(step: ExecutionStep): string {
	if (!step.endedAt) return '进行中';
	return `${Math.max(0, (step.endedAt - step.startedAt) / 1000).toFixed(1)}s`;
}

function StepIcon({ step }: { step: ExecutionStep }) {
	const Icon = step.status === 'failed' ? TriangleAlert : ICONS[step.kind];
	return <Icon size={14} />;
}

export function ExecutionInspector() {
	const execution = useWorkbenchStore((s) => s.execution);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const selectStep = useWorkbenchStore((s) => s.selectStep);
	const prepareRetry = useWorkbenchStore((s) => s.prepareRetry);
	const selected = execution.steps.find((step) => step.id === selectedStepId) ?? execution.steps.at(-1);

	return (
		<aside className="execution-inspector">
			<div className="execution-inspector__header">
				<div>
					<span className="pane-eyebrow">AGENT ACTIVITY</span>
					<h2>执行过程</h2>
				</div>
				<button type="button" disabled={!execution.lastPrompt} onClick={prepareRetry} title="将上一条任务填入输入框，不会自动执行" className="icon-action">
					<RotateCcw size={14} /> 重试
				</button>
			</div>
			<div className="execution-timeline" aria-label="Agent 执行时间线">
				{execution.steps.length === 0 ? (
					<div className="execution-empty"><Play size={16} /><span>任务开始后，工具调用会在这里按真实顺序展开。</span></div>
				) : execution.steps.map((step) => (
					<button key={step.id} type="button" onClick={() => selectStep(step.id)} className={`execution-step ${selected?.id === step.id ? 'is-selected' : ''} is-${step.status}`}>
						<span className="execution-step__icon"><StepIcon step={step} /></span>
						<span className="execution-step__body"><b>{step.title}</b><small>{step.kind} · {duration(step)}</small></span>
						<span className="execution-step__state">{step.status === 'waiting' ? '待确认' : step.status === 'running' ? '运行中' : step.status === 'failed' ? '失败' : '完成'}</span>
					</button>
				))}
			</div>
			<div className="execution-detail">
				<div className="pane-eyebrow">STEP DETAIL</div>
				{selected ? <>
					<h3>{selected.title}</h3>
					{selected.args && <DetailBlock title="参数" value={selected.args} />}
					{selected.partialResult && <DetailBlock title="实时输出" value={selected.partialResult} />}
					{selected.result && <DetailBlock title={selected.kind === 'edit' ? '变更结果' : '最终输出'} value={selected.result} />}
					{selected.error && <DetailBlock title="错误" value={selected.error} error />}
					{!selected.args && !selected.partialResult && !selected.result && !selected.error && <p>正在等待 sidecar 返回详细结果…</p>}
				</> : <p>选择一个步骤查看参数、输出和变更结果。</p>}
			</div>
		</aside>
	);
}

function DetailBlock({ title, value, error = false }: { title: string; value: string; error?: boolean }) {
	return <section className={error ? 'execution-detail__block is-error' : 'execution-detail__block'}><span>{title}</span><pre>{value}</pre></section>;
}
