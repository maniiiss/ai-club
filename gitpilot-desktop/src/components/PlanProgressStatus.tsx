import { Check, Clock3, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import { parsePlanProgress, type PlanProgressStep } from './plan-progress';
import styles from './PlanProgressStatus.module.css';

function StepIcon({ status }: { status: PlanProgressStep['status'] }) {
	if (status === 'completed') return <Check size={13} strokeWidth={2.8} aria-hidden="true" />;
	if (status === 'running') return <Loader2 size={13} className={styles.spin} aria-hidden="true" />;
	return <Clock3 size={12} aria-hidden="true" />;
}

/**
 * 输入框上方的紧凑计划状态。
 *
 * 业务意图：默认状态只暴露当前步骤和总数，避免执行细节挤占输入区；
 * 用户需要上下文时再通过悬停或键盘聚焦展开完整清单，浮层采用绝对定位，
 * 因而不会改变聊天正文和输入框的布局高度。
 */
export function PlanProgressStatus() {
	const statuses = useSessionStore((state) => state.extensionStatuses);
	const widgets = useSessionStore((state) => state.extensionWidgets);
	const [open, setOpen] = useState(false);
	const progress = parsePlanProgress(statuses, widgets);
	if (!progress) return null;

	return <div
		className={styles.root}
		onMouseEnter={() => setOpen(true)}
		onMouseLeave={() => setOpen(false)}
		onFocus={() => setOpen(true)}
		onBlur={(event) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
		}}
	>
		<button
			type="button"
			className={styles.compact}
			aria-label={`第 ${progress.current}/${progress.total} 步`}
			aria-expanded={open}
			onClick={() => setOpen((value) => !value)}
		>
			<span className={styles.compactIcon}><StepIcon status={progress.steps[progress.current - 1]?.status ?? 'running'} /></span>
			<span>第 {progress.current}/{progress.total} 步</span>
		</button>
		{open && <div className={styles.popover} role="status" aria-label="完整计划步骤">
			<div className={styles.popoverHeader}><span>执行步骤</span><span>{progress.completed}/{progress.total}</span></div>
			<ol className={styles.steps}>
				{progress.steps.map((step) => <li key={step.ordinal} className={`${styles.step} ${styles[`step_${step.status}`]}`}>
					<span className={styles.stepIcon}><StepIcon status={step.status} /></span>
					<span className={styles.stepTitle}>{step.title}</span>
				</li>)}
			</ol>
		</div>}
	</div>;
}
