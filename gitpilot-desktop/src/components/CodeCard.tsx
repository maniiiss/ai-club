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
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileCode, Terminal, WarningCircle } from '@phosphor-icons/react';
import type { UIMessage } from '@/src/store/session';
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

	// text / thinking / image：走 Markdown
	return (
		<div className={styles.markdown}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
		</div>
	);
});
