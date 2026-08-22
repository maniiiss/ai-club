import { Check, CircleNotch as Loader2, Clock as Clock3 } from '@phosphor-icons/react';
import { memo, useState } from 'react';
import { useDesignStore } from '@/src/store/design';
import type { DesignTodoItem } from '@/src/design/design-types';
import styles from '../PlanProgressStatus.module.css';

function StepIcon({ state }: { state: DesignTodoItem['state'] }) {
	if (state === 'done') return <Check size={13} strokeWidth={2.8} aria-hidden="true" />;
	if (state === 'active') return <Loader2 size={13} className={styles.spin} aria-hidden="true" />;
	return <Clock3 size={12} aria-hidden="true" />;
}

/**
 * Design 计划沿用 Code 的输入框上方交互，由模型通过结构化计划工具提交步骤。
 * 业务意图：执行期间提供轻量进度入口，避免把复杂度判断硬编码在宿主关键词中。
 */
export const DesignPlanProgressStatus = memo(function DesignPlanProgressStatus() {
	const todos = useDesignStore((state) => state.todos);
	const [open, setOpen] = useState(false);
	if (todos.length === 0) return null;

	const completed = todos.filter((todo) => todo.state === 'done').length;
	const currentIndex = todos.findIndex((todo) => todo.state !== 'done');
	const current = currentIndex >= 0 ? currentIndex + 1 : todos.length;

	return <div
		className={`${styles.root} ${styles.designRoot}`}
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
			aria-label={`第 ${current}/${todos.length} 步`}
			aria-expanded={open}
			onClick={() => setOpen((value) => !value)}
		>
			<span className={styles.compactIcon}><StepIcon state={todos[current - 1]?.state ?? 'active'} /></span>
			<span>第 {current}/{todos.length} 步</span>
		</button>
		{open && <div className={styles.popover} role="status" aria-label="完整设计计划">
			<div className={styles.popoverHeader}><span>执行步骤</span><span>{completed}/{todos.length}</span></div>
			<ol className={styles.steps}>
				{todos.map((todo) => <li key={todo.id} className={`${styles.step} ${styles[`step_${todo.state === 'done' ? 'completed' : todo.state === 'active' ? 'running' : 'pending'}`]}`}>
					<span className={styles.stepIcon}><StepIcon state={todo.state} /></span>
					<span className={styles.stepTitle}>{todo.text}</span>
				</li>)}
			</ol>
		</div>}
	</div>;
});
