/** 目标底部输出区：只负责输出表面和长文本滚动，不改变执行 store 数据。 */
import { useWorkbenchStore } from '@/src/store/workbench';
import styles from './TargetExecutionOutputPanel.module.css';

export function TargetExecutionOutputPanel() {
	const execution = useWorkbenchStore((s) => s.execution);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const step = execution.steps.find((item) => item.id === selectedStepId) ?? execution.steps.at(-1);
	const text = step?.result ?? step?.partialResult ?? step?.args ?? '选择执行步骤后，这里会显示 sidecar 返回的原始输出。';
	return <section className={styles.root} aria-label="执行输出"><span className={styles.eyebrow}>OUTPUT {step ? `· ${step.title}` : ''}</span><pre>{text}</pre></section>;
}
