/** 计划专用消息卡片：在对话中保持摘要可扫读，完整正文交给通用右侧抽屉。 */
import { useState } from 'react';
import { Check, Clipboard, ListChecks, MoveUpRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { copyText } from './ContentDrawer';
import { parsePlanContent } from './plan-content';
import styles from './PlanCard.module.css';

export function PlanCard({ message }: { message: UIMessage }) {
	const plan = parsePlanContent(message.text);
	const openContentDrawer = useWorkbenchStore((state) => state.openContentDrawer);
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		setCopied(await copyText(plan.markdown));
	};

	const open = () => {
		openContentDrawer({
			id: `plan:${message.id}`,
			kind: 'plan',
			title: plan.title,
			content: plan.markdown,
			description: '完整实施计划',
		});
	};

	return (
		<article className={styles.card} aria-label="实施计划">
			<div className={styles.topLine} aria-hidden="true" />
			<header className={styles.header}>
				<span className={styles.label}><ListChecks size={16} aria-hidden="true" />计划</span>
				<Button type="button" variant="ghost" size="icon-sm" className={styles.copyButton} onClick={() => void copy()} aria-label={copied ? '已复制计划' : '复制计划'} title={copied ? '已复制' : '复制完整计划'}>
					{copied ? <Check size={15} /> : <Clipboard size={15} />}
				</Button>
			</header>
			<div className={styles.preview}>
				<div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.previewMarkdown}</ReactMarkdown></div>
				<div className={styles.footer}>
					<Button type="button" variant="unstyled" size="sm" className={styles.openButton} onClick={open}>
						查看完整计划 <MoveUpRight size={14} aria-hidden="true" />
					</Button>
				</div>
			</div>
		</article>
	);
}

