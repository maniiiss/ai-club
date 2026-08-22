/**
 * 代码交互卡片。
 *
 * 根据 message.kind 渲染不同卡片：
 * - diff：文件路径头 + 增删行着色
 * - bash：等宽输出 + 退出码标签
 * - file：文件路径头 + 只读内容
 * - text/error：直接 Markdown 渲染
 *
 * 对应设计文档第 6.2 节"代码交互卡片"。
 */
import { memo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, FileCode, Terminal, WarningCircle } from '@phosphor-icons/react';
import type { UIMessage } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { copyText } from '@/src/lib/clipboard';
import styles from './CodeCard.module.css';

/** unified diff 行级着色视图，供 CodeCard 与 ChangedFilesCard 复用。 */
export function DiffView({ text }: { text: string }) {
	const lines = text.split('\n');
	return (
		<pre className={styles.diff}>
			{lines.map((line, i) => {
				const cls = line.startsWith('+') && !line.startsWith('+++')
					? styles.diffAdd
					: line.startsWith('-') && !line.startsWith('---')
						? styles.diffDel
						: styles.diffLine;
				return (
					<div key={i} className={`${styles.diffRow} ${cls}`}>
						{line || ' '}
					</div>
				);
			})}
		</pre>
	);
}

/**
 * Markdown 围栏代码块：流式输出期间不显示操作；输出结束后悬停出现整块复制按钮。
 * children 是 ReactMarkdown 传下来的 <code> 元素，复制内容通过 pre 节点取真实文本。
 */
function MarkdownCodeBlock({ children, showCopy }: { children?: ReactNode; showCopy: boolean }) {
	const preRef = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		const text = preRef.current?.innerText ?? '';
		if (text) setCopied(await copyText(text));
	};
	return (
		<div className={styles.codeBlockWrap}>
			<pre ref={preRef}>{children}</pre>
			{showCopy && (
				<Hint content={copied ? '已复制' : '复制代码'}>
					<Button type="button" variant="ghost" size="icon-sm" className={styles.codeBlockCopy} onClick={() => void copy()} aria-label={copied ? '已复制代码' : '复制代码'}>
						{copied ? <Check weight="bold" size={13} aria-hidden="true" /> : <Copy weight="regular" size={13} aria-hidden="true" />}
					</Button>
				</Hint>
			)}
		</div>
	);
}

export const CodeCard = memo(function CodeCard({ message }: { message: UIMessage }) {
	const tool = (message.meta?.tool as string) ?? '';

	if (message.kind === 'diff') {
		return (
			<div className={styles.card}>
				<div className={styles.cardHeader}>
					<FileCode weight="regular" size={13} />
					<span className={styles.mono}>{tool}</span>
				</div>
				<DiffView text={message.text} />
			</div>
		);
	}

	if (message.kind === 'bash') {
		return (
			<div className={styles.card}>
				<div className={styles.cardHeader}>
					<Terminal weight="regular" size={13} />
					<span className={styles.mono}>bash</span>
				</div>
				<pre className={styles.code}>{message.text || ' '}</pre>
			</div>
		);
	}

	if (message.kind === 'file') {
		return (
			<div className={styles.card}>
				<div className={styles.cardHeader}>
					<FileCode weight="regular" size={13} />
					<span className={styles.mono}>{tool}</span>
				</div>
				<pre className={`${styles.code} ${styles.secondaryCode}`}>{message.text || ' '}</pre>
			</div>
		);
	}

	if (message.kind === 'error') {
		return (
			<div className={styles.error}>
				<WarningCircle weight="regular" size={15} />
				<span>{message.text}</span>
			</div>
		);
	}

	// text / thinking / image：走 Markdown；代码块在输出结束后提供复制入口
	return (
		<div className={styles.markdown}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ({ children }) => <MarkdownCodeBlock showCopy={!message.streaming}>{children}</MarkdownCodeBlock> }}>{message.text}</ReactMarkdown>
		</div>
	);
});
