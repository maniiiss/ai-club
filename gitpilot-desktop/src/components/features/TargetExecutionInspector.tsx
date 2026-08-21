/** 目标右侧执行面板：执行过程、审查、文件与计划快照通过同一侧栏 Tab 切换。 */
import { CheckCircle, Circle, FileMagnifyingGlass, GitDiff, ListChecks, PencilSimple, Play, Plus, Terminal, TreeStructure, Warning, Wrench, X } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkbenchStore, type ExecutionKind, type ExecutionStep } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { TargetProjectFilesPanel } from './TargetProjectFilesPanel';
import { TargetReviewPanel } from './TargetReviewPanel';
import styles from './TargetExecutionInspector.module.css';

const ICONS: Record<ExecutionKind, typeof Circle> = { plan: Circle, read: FileMagnifyingGlass, edit: PencilSimple, command: Terminal, verify: CheckCircle, complete: CheckCircle, other: Wrench };
function duration(step: ExecutionStep): string { return step.endedAt ? `${Math.max(0, (step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : '进行中'; }
function StepIcon({ step }: { step: ExecutionStep }) { const Icon = step.status === 'failed' ? Warning : ICONS[step.kind]; return <Icon weight="regular" size={15} />; }

interface TargetExecutionInspectorProps {
	/** Code 主工作区暂不展示执行步骤，但保留文件和计划等右侧工具窗口。 */
	showExecution?: boolean;
}

export function TargetExecutionInspector({ showExecution = true }: TargetExecutionInspectorProps) {
	// 不展示执行步骤时返回稳定的 null，避免工具事件更新导致右侧工具窗口重复渲染。
	const execution = useWorkbenchStore((s) => showExecution ? s.execution : null);
	const rightPanelTabs = useWorkbenchStore((s) => s.rightPanelTabs);
	const selectedStepId = useWorkbenchStore((s) => showExecution ? s.selectedStepId : null);
	const selectStep = useWorkbenchStore((s) => s.selectStep);
	const activateRightPanelTab = useWorkbenchStore((s) => s.activateRightPanelTab);
	const closeRightPanelTab = useWorkbenchStore((s) => s.closeRightPanelTab);
	const openExecutionPanelTab = useWorkbenchStore((s) => s.openExecutionPanelTab);
	const openProjectFilesPanel = useWorkbenchStore((s) => s.openProjectFilesPanel);
	const openReviewPanelTab = useWorkbenchStore((s) => s.openReviewPanelTab);
	const selected = execution?.steps.find((step) => step.id === selectedStepId) ?? execution?.steps.at(-1);
	const activeTabId = rightPanelTabs.activeTabId === 'files' && rightPanelTabs.filesOpen
		? 'files'
		: rightPanelTabs.activeTabId === 'review' && rightPanelTabs.reviewOpen
			? 'review'
			: showExecution && rightPanelTabs.activeTabId === 'execution'
				? 'execution'
				: rightPanelTabs.plans.some((tab) => tab.id === rightPanelTabs.activeTabId)
					? rightPanelTabs.activeTabId
					: rightPanelTabs.filesOpen
						? 'files'
						: rightPanelTabs.reviewOpen
							? 'review'
							: rightPanelTabs.plans[0]?.id ?? null;
	const activePlan = rightPanelTabs.plans.find((tab) => tab.id === activeTabId) ?? null;
	return <aside className={styles.root} data-ui-mode={showExecution ? 'execution' : 'code'} aria-label={showExecution ? '执行过程' : '右侧工具窗口'}>
		<nav className={styles.tabs} aria-label="右侧工具窗口页签" onMouseDown={(event) => event.stopPropagation()}>
			<div className={styles.tabScroller}>
				{showExecution && rightPanelTabs.executionOpen && <div data-tab-id="execution" className={`${styles.tab} ${activeTabId === 'execution' ? styles.tabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTabId === 'execution'} onClick={() => activateRightPanelTab('execution')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateRightPanelTab('execution'); } }}><Circle weight="regular" size={15} /><span>执行过程</span><button type="button" className={styles.tabClose} onClick={(event) => { event.stopPropagation(); closeRightPanelTab('execution'); }} aria-label="关闭执行过程"><X weight="bold" size={13} /></button></div>}
				{rightPanelTabs.filesOpen && <div data-tab-id="files" className={`${styles.tab} ${activeTabId === 'files' ? styles.tabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTabId === 'files'} onClick={() => activateRightPanelTab('files')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateRightPanelTab('files'); } }}><TreeStructure weight="regular" size={15} /><span>文件</span><button type="button" className={styles.tabClose} onClick={(event) => { event.stopPropagation(); closeRightPanelTab('files'); }} aria-label="关闭文件"><X weight="bold" size={13} /></button></div>}
				{rightPanelTabs.reviewOpen && <div data-tab-id="review" className={`${styles.tab} ${activeTabId === 'review' ? styles.tabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTabId === 'review'} onClick={() => activateRightPanelTab('review')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateRightPanelTab('review'); } }}><GitDiff weight="regular" size={15} /><span>审查</span><button type="button" className={styles.tabClose} onClick={(event) => { event.stopPropagation(); closeRightPanelTab('review'); }} aria-label="关闭审查"><X weight="bold" size={13} /></button></div>}
				{rightPanelTabs.plans.map((tab) => <Hint key={tab.id} content={tab.title}><div data-tab-id="plan" className={`${styles.tab} ${activeTabId === tab.id ? styles.tabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTabId === tab.id} onClick={() => activateRightPanelTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateRightPanelTab(tab.id); } }}><ListChecks weight="regular" size={15} /><span>计划</span><button type="button" className={styles.tabClose} onClick={(event) => { event.stopPropagation(); closeRightPanelTab(tab.id); }} aria-label="关闭计划"><X weight="bold" size={13} /></button></div></Hint>)}
			</div>
			<div className={styles.tabActions}>
				<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={`${styles.addTab} focus-visible:outline-none focus-visible:ring-0`} aria-label="打开右侧工具窗口" data-gp-hint="打开工具窗口"><Plus weight="bold" size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{showExecution && <DropdownMenuItem onSelect={() => openExecutionPanelTab()}><Circle weight="regular" />执行过程</DropdownMenuItem>}<DropdownMenuItem onSelect={() => openProjectFilesPanel()}><TreeStructure weight="regular" />文件</DropdownMenuItem><DropdownMenuItem onSelect={() => openReviewPanelTab()}><GitDiff weight="regular" />审查</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
			</div>
		</nav>
		{activePlan ? <PlanPanel plan={activePlan} /> : activeTabId === 'files' && rightPanelTabs.filesOpen ? <TargetProjectFilesPanel /> : activeTabId === 'review' && rightPanelTabs.reviewOpen ? <TargetReviewPanel /> : showExecution && activeTabId === 'execution' ? <>
			<ScrollArea className={styles.timeline} aria-label="Agent 执行时间线">{execution?.steps.length === 0 ? <div className={styles.empty}><Play weight="regular" size={18} /><span>任务开始后，工具调用会在这里按真实顺序展开。</span></div> : execution?.steps.map((step) => <Button key={step.id} type="button" variant="unstyled" size="sm" onClick={() => selectStep(step.id)} className={`${styles.step} ${selected?.id === step.id ? styles.selected : ''} h-auto min-h-[48px] focus-visible:outline-none`}><span className={`${styles.stepIcon} ${styles[`status_${step.status}`]}`}><StepIcon step={step} /></span><span className={styles.stepBody}><b>{step.title}</b><small>{step.kind} · {duration(step)}</small></span><span className={styles.stepState}>{step.status === 'waiting' ? '待确认' : step.status === 'running' ? '运行中' : step.status === 'failed' ? '失败' : '完成'}</span></Button>)}</ScrollArea>
			<div className={styles.detail}><span className={styles.eyebrow}>执行详情</span>{selected ? <><h3>{selected.title}</h3>{selected.args && <DetailBlock title="参数" value={selected.args} />}{selected.partialResult && <DetailBlock title="实时输出" value={selected.partialResult} />}{selected.result && <DetailBlock title={selected.kind === 'edit' ? '变更结果' : '最终输出'} value={selected.result} />}{selected.error && <DetailBlock title="错误" value={selected.error} error />}{!selected.args && !selected.partialResult && !selected.result && !selected.error && <p>正在等待 sidecar 返回详细结果…</p>}</> : <p>选择一个步骤查看参数、输出和变更结果。</p>}</div>
		</> : <div className={styles.emptyPanel}><ListChecks size={18} /><p>右侧窗口暂无内容</p><span>点击右上角 + 打开{showExecution ? '执行过程' : '文件'}。</span></div>}
	</aside>;
}

function DetailBlock({ title, value, error = false }: { title: string; value: string; error?: boolean }) { return <section className={`${styles.detailBlock} ${error ? styles.detailError : ''}`}><span>{title}</span><pre>{value}</pre></section>; }

function PlanPanel({ plan }: { plan: { markdown: string } }) {
	return <ScrollArea fitContent className={styles.planBody} aria-label="完整实施计划"><article className={styles.planMarkdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.markdown}</ReactMarkdown></article></ScrollArea>;
}
