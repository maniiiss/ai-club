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
import { FileCode, Terminal, AlertCircle } from 'lucide-react';
import type { UIMessage } from '@/src/store/session';

function DiffView({ text }: { text: string }) {
	const lines = text.split('\n');
	return (
		<pre className="overflow-x-auto rounded-md bg-[var(--color-code-bg)] p-3 text-xs leading-tight">
			{lines.map((line, i) => {
				const cls = line.startsWith('+') && !line.startsWith('+++')
					? 'bg-[var(--color-code-diff-add)] text-[var(--color-success)]'
					: line.startsWith('-') && !line.startsWith('---')
						? 'bg-[var(--color-code-diff-del)] text-[var(--color-error)]'
						: 'text-[var(--color-text-secondary)]';
				return (
					<div key={i} className={`px-1 ${cls}`}>
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
			<div className="my-2 overflow-hidden rounded-md border border-[var(--color-border)]">
				<div className="flex items-center gap-2 bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
					<FileCode size={13} />
					<span className="mono">{tool}</span>
				</div>
				<DiffView text={message.text} />
			</div>
		);
	}

	if (message.kind === 'bash') {
		return (
			<div className="my-2 overflow-hidden rounded-md border border-[var(--color-border)]">
				<div className="flex items-center gap-2 bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
					<Terminal size={13} />
					<span className="mono">bash</span>
				</div>
				<pre className="overflow-x-auto bg-[var(--color-code-bg)] p-3 text-xs leading-tight text-[var(--color-text)]">{message.text || ' '}</pre>
			</div>
		);
	}

	if (message.kind === 'file') {
		return (
			<div className="my-2 overflow-hidden rounded-md border border-[var(--color-border)]">
				<div className="flex items-center gap-2 bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
					<FileCode size={13} />
					<span className="mono">{tool}</span>
				</div>
				<pre className="overflow-x-auto bg-[var(--color-code-bg)] p-3 text-xs leading-tight text-[var(--color-text-secondary)]">{message.text || ' '}</pre>
			</div>
		);
	}

	if (message.kind === 'error') {
		return (
			<div className="my-2 flex items-start gap-2 rounded-md border border-[var(--color-error)]/40 bg-[var(--color-code-diff-del)] p-3 text-sm text-[var(--color-error)]">
				<AlertCircle size={15} className="mt-0.5 shrink-0" />
				<span>{message.text}</span>
			</div>
		);
	}

	// text / thinking / image：走 Markdown
	return (
		<div className="prose prose-invert max-w-none text-sm text-[var(--color-text)]">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
		</div>
	);
});
