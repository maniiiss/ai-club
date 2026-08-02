/** 目标执行面板：阶段列表与详情分层，关闭后由标题栏恢复，不修改 sidecar 事件语义。 */
import { Check, CircleDot, FilePenLine, FileSearch, Play, RotateCcw, Terminal, TriangleAlert, Wrench } from 'lucide-react';
import { useWorkbenchStore, type ExecutionKind, type ExecutionStep } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import styles from './TargetExecutionInspector.module.css';

const ICONS: Record<ExecutionKind, typeof CircleDot> = { plan: CircleDot, read: FileSearch, edit: FilePenLine, command: Terminal, verify: Check, complete: Check, other: Wrench };
function duration(step: ExecutionStep): string { return step.endedAt ? `${Math.max(0, (step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : '进行中'; }
function StepIcon({ step }: { step: ExecutionStep }) { const Icon = step.status === 'failed' ? TriangleAlert : ICONS[step.kind]; return <Icon size={14} />; }

export function TargetExecutionInspector() {
	const execution = useWorkbenchStore((s) => s.execution);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const selectStep = useWorkbenchStore((s) => s.selectStep);
	const prepareRetry = useWorkbenchStore((s) => s.prepareRetry);
	const selected = execution.steps.find((step) => step.id === selectedStepId) ?? execution.steps.at(-1);
	return <aside className={styles.root} aria-label="执行过程">
		<header className={styles.header}><div><h2>执行过程</h2><p>{execution.steps.length ? `${execution.steps.length} 个阶段` : '等待任务开始'}</p></div><div className={styles.actions}><Button type="button" variant="outline" size="sm" disabled={!execution.lastPrompt} onClick={prepareRetry} title="将上一条任务填入输入框，不会自动执行"><RotateCcw />重试</Button></div></header>
		<ScrollArea className={styles.timeline} aria-label="Agent 执行时间线">{execution.steps.length === 0 ? <div className={styles.empty}><Play size={16} /><span>任务开始后，工具调用会在这里按真实顺序展开。</span></div> : execution.steps.map((step) => <Button key={step.id} type="button" variant="unstyled" size="sm" onClick={() => selectStep(step.id)} className={`${styles.step} ${selected?.id === step.id ? styles.selected : ''} h-auto min-h-[48px] focus-visible:outline-none`}><span className={`${styles.stepIcon} ${styles[`status_${step.status}`]}`}><StepIcon step={step} /></span><span className={styles.stepBody}><b>{step.title}</b><small>{step.kind} · {duration(step)}</small></span><span className={styles.stepState}>{step.status === 'waiting' ? '待确认' : step.status === 'running' ? '运行中' : step.status === 'failed' ? '失败' : '完成'}</span></Button>)}</ScrollArea>
		<div className={styles.detail}><span className={styles.eyebrow}>执行详情</span>{selected ? <><h3>{selected.title}</h3>{selected.args && <DetailBlock title="参数" value={selected.args} />}{selected.partialResult && <DetailBlock title="实时输出" value={selected.partialResult} />}{selected.result && <DetailBlock title={selected.kind === 'edit' ? '变更结果' : '最终输出'} value={selected.result} />}{selected.error && <DetailBlock title="错误" value={selected.error} error />}{!selected.args && !selected.partialResult && !selected.result && !selected.error && <p>正在等待 sidecar 返回详细结果…</p>}</> : <p>选择一个步骤查看参数、输出和变更结果。</p>}</div>
	</aside>;
}

function DetailBlock({ title, value, error = false }: { title: string; value: string; error?: boolean }) { return <section className={`${styles.detailBlock} ${error ? styles.detailError : ''}`}><span>{title}</span><pre>{value}</pre></section>; }
