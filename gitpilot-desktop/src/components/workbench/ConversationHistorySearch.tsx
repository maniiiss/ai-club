import { Clock, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';
import { searchConversationHistory, type ConversationSearchOptions, type ConversationSearchResult } from './conversation-search';
import styles from './ConversationHistorySearch.module.css';

interface ConversationHistorySearchProps<T> extends ConversationSearchOptions<T> {
	items: readonly T[];
	className?: string;
	label?: string;
	triggerText?: string;
	triggerVariant?: 'icon' | 'nav';
	placeholder?: string;
	onSelect: (item: T) => void | Promise<void>;
}

function formatUpdatedAt(value: ConversationSearchResult<unknown>['updatedAt']): string {
	const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : 0;
	if (!timestamp || !Number.isFinite(timestamp)) return '';
	return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/** Code 与 Work 侧栏共用的历史搜索入口；关闭弹层后再切换任务，避免切换过程中残留浮层。 */
export function ConversationHistorySearch<T>({ items, className, label = '搜索历史任务', triggerText, triggerVariant = 'icon', placeholder = '搜索标题或消息内容…', onSelect, ...searchOptions }: ConversationHistorySearchProps<T>) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const results = useMemo(() => searchConversationHistory(items, query, searchOptions), [items, query, searchOptions]);

	useEffect(() => {
		if (!open) return;
		const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
		return () => window.cancelAnimationFrame(frame);
	}, [open]);

	const close = () => {
		setOpen(false);
		setQuery('');
	};
	const select = (result: ConversationSearchResult<T>) => {
		close();
		void onSelect(result.item);
	};

	return <Popover open={open} onOpenChange={(value) => value ? setOpen(true) : close()}>
		<Hint content={label}>
			<PopoverTrigger asChild>
				<Button type="button" variant="ghost" size={triggerVariant === 'nav' ? 'sm' : 'icon-sm'} className={cn(styles.trigger, triggerVariant === 'nav' ? styles.navTrigger : '', className)} aria-label={label}><MagnifyingGlass weight="regular" aria-hidden="true" />{triggerVariant === 'nav' && <span>{triggerText ?? label}</span>}</Button>
			</PopoverTrigger>
		</Hint>
		<PopoverContent side="bottom" align="end" className={styles.popover} onOpenAutoFocus={(event) => event.preventDefault()}>
			<div className={styles.root}>
				<div className={styles.heading}><span><MagnifyingGlass weight="regular" aria-hidden="true" />{label}</span><button type="button" className={styles.close} onClick={close} aria-label="关闭搜索"><X weight="bold" aria-hidden="true" /></button></div>
				<div className={styles.inputRow}><MagnifyingGlass weight="regular" aria-hidden="true" /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') close(); }} placeholder={placeholder} aria-label={placeholder} /></div>
				{!query.trim() ? <div className={styles.empty}>输入关键词，搜索标题和历史消息</div> : results.length === 0 ? <div className={styles.empty}>未找到匹配的历史任务</div> : <div className={styles.results} role="listbox" aria-label="历史任务搜索结果">{results.map((result) => { const formattedTime = formatUpdatedAt(result.updatedAt); return <button key={result.key} type="button" className={styles.result} role="option" onClick={() => select(result)}><span className={styles.resultIcon}><Clock weight="regular" aria-hidden="true" /></span><span className={styles.resultCopy}><strong>{result.title}</strong><span>{result.summary}</span></span>{formattedTime && <time dateTime={String(result.updatedAt)}>{formattedTime}</time>}</button>; })}</div>}
			</div>
		</PopoverContent>
	</Popover>;
}
