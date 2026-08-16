/** 计划专用消息卡片：在对话中保持摘要可扫读，完整正文打开右侧执行栏 Tab。 */
import { useState } from 'react';
import { Check, Clipboard, ListChecks, MoveUpRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { useSessionStore } from '@/src/store/session';
import { copyText } from '@/src/lib/clipboard';
import { parsePlanContent } from './plan-content';
import styles from './PlanCard.module.css';

export function PlanCard({ message }: { message: UIMessage }) {
	const plan = parsePlanContent(message.text);
	const openPlanPanelTab = useWorkbenchStore((state) => state.openPlanPanelTab);
	const selectedSessionPath = useSessionStore((state) => state.selectedSessionPath ?? state.sessionState?.sessionFile ?? null);
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		setCopied(await copyText(plan.markdown));
	};

	const open = () => {
		if (!selectedSessionPath) return;
		openPlanPanelTab({ sourceSessionPath: selectedSessionPath, title: plan.title, markdown: plan.markdown });
	};

	return (
		<article className={styles.card} aria-label="实施计划">
			<div className={styles.topLine} aria-hidden="true" />
			<header className={styles.header}>
				<span className={styles.label}><ListChecks size={16} aria-hidden="true" />计划</span>
				<Hint content={copied ? '已复制' : '复制完整计划'}><Button type="button" variant="ghost" size="icon-sm" className={styles.copyButton} onClick={() => void copy()} aria-label={copied ? '已复制计划' : '复制计划'}>
					{copied ? <Check size={15} /> : <Clipboard size={15} />}
				</Button></Hint>
			</header>
			<div className={styles.preview}>
				<div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.previewMarkdown}</ReactMarkdown></div>
				<div className={styles.footer}>
					<Button type="button" variant="unstyled" size="sm" className={styles.openButton} onClick={open} disabled={!selectedSessionPath}>
						查看完整计划 <MoveUpRight size={14} aria-hidden="true" />
					</Button>
				</div>
			</div>
		</article>
	);
}
