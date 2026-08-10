/**
 * 通用右侧内容抽屉。
 * 业务意图：长计划、代码、Diff 和纯文本都在同一个可审阅容器中展开，
 * 不让消息卡片各自实现焦点、遮罩、复制和关闭行为。
 */
import { useEffect, useState } from 'react';
import { Check, Clipboard, Code2, FileText, GitCompare } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { useWorkbenchStore, type ContentDrawerContent, type ContentDrawerKind } from '@/src/store/workbench';
import { copyText } from '@/src/lib/clipboard';
import styles from './ContentDrawer.module.css';

const KIND_LABELS: Record<ContentDrawerKind, string> = { code: '代码', diff: 'Diff', text: '文本' };
const KIND_ICONS: Record<ContentDrawerKind, typeof FileText> = { code: Code2, diff: GitCompare, text: FileText };

function DiffContent({ text }: { text: string }) {
	return <pre className={styles.diff}>{text.split('\n').map((line, index) => {
		const lineClass = line.startsWith('+') && !line.startsWith('+++')
			? styles.diffAdd
			: line.startsWith('-') && !line.startsWith('---')
				? styles.diffDel
				: undefined;
		return <div key={`${index}-${line}`} className={`${styles.diffRow} ${lineClass ?? ''}`}>{line || ' '}</div>;
	})}</pre>;
}

function DrawerBody({ content }: { content: ContentDrawerContent }) {
	if (content.kind === 'diff') return <DiffContent text={content.content} />;
	if (content.kind === 'code') return <pre className={styles.code}><code>{content.content}</code></pre>;
	return <pre className={styles.text}>{content.content}</pre>;
}

export function ContentDrawer() {
	const content = useWorkbenchStore((state) => state.contentDrawer);
	const close = useWorkbenchStore((state) => state.closeContentDrawer);
	const [copied, setCopied] = useState(false);
	const Icon = content ? KIND_ICONS[content.kind] : FileText;
	const label = content ? KIND_LABELS[content.kind] : '内容';

	useEffect(() => {
		setCopied(false);
	}, [content?.id]);

	const copy = async () => {
		if (!content) return;
		setCopied(await copyText(content.content));
	};

	return (
		<Sheet open={content !== null} onOpenChange={(open) => { if (!open) close(); }}>
			<SheetContent side="right" width="wide" className={styles.content} aria-describedby="content-drawer-description">
				<SheetHeader className={styles.header}>
					<div className={styles.heading}>
						<span className={styles.headingIcon}><Icon size={15} aria-hidden="true" /></span>
						<div>
							<p className={styles.eyebrow}>{label}</p>
							<SheetTitle className={styles.title}>{content?.title ?? '内容详情'}</SheetTitle>
							<SheetDescription id="content-drawer-description" className={styles.description}>{content?.description ?? '完整内容'}</SheetDescription>
						</div>
					</div>
					<button type="button" className={styles.copyButton} onClick={() => void copy()} aria-label={copied ? '已复制' : '复制内容'} title={copied ? '已复制' : '复制内容'}>
						{copied ? <Check size={15} /> : <Clipboard size={15} />}
					</button>
				</SheetHeader>
				<div className={styles.body}>{content && <DrawerBody content={content} />}</div>
			</SheetContent>
		</Sheet>
	);
}
