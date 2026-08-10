/** 目标右侧执行面板：执行过程与计划快照通过同一侧栏 Tab 切换。 */
import { useEffect, useState } from 'react';
import { Check, CircleDot, Clipboard, FilePenLine, FileSearch, ListChecks, Play, RotateCcw, Terminal, TriangleAlert, Wrench, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkbenchStore, type ExecutionKind, type ExecutionStep } from '@/src/store/workbench';
import { copyText } from '@/src/lib/clipboard';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import styles from './TargetExecutionInspector.module.css';

const ICONS: Record<ExecutionKind, typeof CircleDot> = { plan: CircleDot, read: FileSearch, edit: FilePenLine, command: Terminal, verify: Check, complete: Check, other: Wrench };
function duration(step: ExecutionStep): string { return step.endedAt ? `${Math.max(0, (step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : '进行中'; }
function StepIcon({ step }: { step: ExecutionStep }) { const Icon = step.status === 'failed' ? TriangleAlert : ICONS[step.kind]; return <Icon size={14} />; }

export function TargetExecutionInspector() {
	const execution = useWorkbenchStore((s) => s.execution);
	const rightPanelTabs = useWorkbenchStore((s) => s.rightPanelTabs);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const selectStep = useWorkbenchStore((s) => s.selectStep);
	const prepareRetry = useWorkbenchStore((s) => s.prepareRetry);
	const activateRightPanelTab = useWorkbenchStore((s) => s.activateRightPanelTab);
	const closeRightPanelTab = useWorkbenchStore((s) => s.closeRightPanelTab);
	const selected = execution.steps.find((step) => step.id === selectedStepId) ?? execution.steps.at(-1);
	const activePlan = rightPanelTabs.plans.find((tab) => tab.id === rightPanelTabs.activeTabId) ?? null;
	return <aside className={styles.root} aria-label="执行过程">
		<nav className={styles.tabs} aria-label="右侧面板页签" onMouseDown={(event) => event.stopPropagation()}>
			<button type="button" className={`${styles.tab} ${rightPanelTabs.activeTabId === 'execution' ? styles.tabActive : ''}`} onClick={() => activateRightPanelTab('execution')}><CircleDot size={13} />执行过程</button>
			{rightPanelTabs.plans.map((tab) => <div key={tab.id} className={`${styles.tab} ${rightPanelTabs.activeTabId === tab.id ? styles.tabActive : ''}`} role="tab" tabIndex={0} aria-selected={rightPanelTabs.activeTabId === tab.id} onClick={() => activateRightPanelTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateRightPanelTab(tab.id); } }} title={tab.title}><ListChecks size={13} /><span>{tab.title}</span><button type="button" className={styles.tabClose} onClick={(event) => { event.stopPropagation(); closeRightPanelTab(tab.id); }} aria-label={`关闭 ${tab.title}`}><X size={12} /></button></div>)}
		</nav>
		{activePlan ? <PlanPanel plan={activePlan} /> : <>
			<header className={styles.header}><div><h2>执行过程</h2><p>{execution.steps.length ? `${execution.steps.length} 个阶段` : '等待任务开始'}</p></div><div className={styles.actions}><Button type="button" variant="outline" size="sm" disabled={!execution.lastPrompt} onClick={prepareRetry} title="将上一条任务填入输入框，不会自动执行"><RotateCcw />重试</Button></div></header>
			<ScrollArea className={styles.timeline} aria-label="Agent 执行时间线">{execution.steps.length === 0 ? <div className={styles.empty}><Play size={16} /><span>任务开始后，工具调用会在这里按真实顺序展开。</span></div> : execution.steps.map((step) => <Button key={step.id} type="button" variant="unstyled" size="sm" onClick={() => selectStep(step.id)} className={`${styles.step} ${selected?.id === step.id ? styles.selected : ''} h-auto min-h-[48px] focus-visible:outline-none`}><span className={`${styles.stepIcon} ${styles[`status_${step.status}`]}`}><StepIcon step={step} /></span><span className={styles.stepBody}><b>{step.title}</b><small>{step.kind} · {duration(step)}</small></span><span className={styles.stepState}>{step.status === 'waiting' ? '待确认' : step.status === 'running' ? '运行中' : step.status === 'failed' ? '失败' : '完成'}</span></Button>)}</ScrollArea>
			<div className={styles.detail}><span className={styles.eyebrow}>执行详情</span>{selected ? <><h3>{selected.title}</h3>{selected.args && <DetailBlock title="参数" value={selected.args} />}{selected.partialResult && <DetailBlock title="实时输出" value={selected.partialResult} />}{selected.result && <DetailBlock title={selected.kind === 'edit' ? '变更结果' : '最终输出'} value={selected.result} />}{selected.error && <DetailBlock title="错误" value={selected.error} error />}{!selected.args && !selected.partialResult && !selected.result && !selected.error && <p>正在等待 sidecar 返回详细结果…</p>}</> : <p>选择一个步骤查看参数、输出和变更结果。</p>}</div>
		</>}
	</aside>;
}

function DetailBlock({ title, value, error = false }: { title: string; value: string; error?: boolean }) { return <section className={`${styles.detailBlock} ${error ? styles.detailError : ''}`}><span>{title}</span><pre>{value}</pre></section>; }

function PlanPanel({ plan }: { plan: { id: string; title: string; markdown: string } }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => setCopied(false), [plan.id, plan.markdown]);
	return <><header className={styles.header}><div><h2>{plan.title}</h2><p>完整实施计划</p></div><div className={styles.actions}><Button type="button" variant="outline" size="sm" onClick={() => void copyText(plan.markdown).then(setCopied)}><Clipboard />{copied ? '已复制' : '复制'}</Button></div></header><ScrollArea className={styles.planBody} aria-label="完整实施计划"><article className={styles.planMarkdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.markdown}</ReactMarkdown></article></ScrollArea></>;
}
