/**
 * @ 文件提及面板。
 *
 * CODE 模式输入框检测到未完成的 @ 提及词时浮层展示工作空间文件候选。
 * 交互与 Slash 命令面板（CommandPalette）一致：↑↓ 移动高亮、Enter 选中、Esc 关闭、外点关闭。
 * 候选已由父组件过滤并 top-N 截断，本组件只负责键盘导航与渲染，
 * 保证大仓库下 DOM 节点数与文件总量无关。
 * 设计文档见 docs/design-docs/code-file-mention-technical-design-v1.md。
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowBendDownLeft as CornerDownLeft, FileText } from '@phosphor-icons/react';
import type { FileMentionRow } from './file-mention';
import styles from './FileMentionPalette.module.css';

interface FileMentionPaletteProps {
	/** 已按当前 query 过滤并截断的候选列表。 */
	results: FileMentionRow[];
	/** 首次扫描进行中（无可用缓存）时显示加载态。 */
	loading: boolean;
	error: string | null;
	/** 工作空间扫描被条目上限截断时提示结果可能不完整。 */
	truncated: boolean;
	onRetry: () => void;
	onPick: (row: FileMentionRow) => void;
	onDismiss: () => void;
}

export function FileMentionPalette({ results, loading, error, truncated, onRetry, onPick, onDismiss }: FileMentionPaletteProps) {
	const [active, setActive] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef(0);
	const resultsRef = useRef<FileMentionRow[]>([]);
	const onPickRef = useRef(onPick);
	const onDismissRef = useRef(onDismiss);

	useEffect(() => {
		resultsRef.current = results;
	}, [results]);

	useEffect(() => {
		onPickRef.current = onPick;
		onDismissRef.current = onDismiss;
	}, [onPick, onDismiss]);

	// 候选集变化后高亮回到第一项，避免停留在越界下标。
	useEffect(() => {
		activeRef.current = 0;
		setActive(0);
	}, [results]);

	// 面板生命周期内只注册一次全局监听，避免每次筛选/移动高亮反复解绑绑定。
	// IME 组合态（isComposing / keyCode 229）事件放行给输入法，避免拼音回车确认被误当作选中文件。
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.isComposing || e.keyCode === 229) return;
			const list = resultsRef.current;
			if (e.key === 'Escape') {
				e.preventDefault();
				onDismissRef.current();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(activeRef.current + 1, Math.max(0, list.length - 1));
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const next = Math.max(activeRef.current - 1, 0);
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const row = list[activeRef.current];
				if (row) onPickRef.current(row);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// 不遮住工作台交互：点击面板外部即关闭并让原点击继续生效。
	useEffect(() => {
		const dismissOutside = (event: PointerEvent) => {
			if (!panelRef.current?.contains(event.target as Node)) onDismissRef.current();
		};
		document.addEventListener('pointerdown', dismissOutside);
		return () => document.removeEventListener('pointerdown', dismissOutside);
	}, []);

	// 键盘移动高亮时保持可见，长列表滚动不跟丢。
	useEffect(() => {
		panelRef.current?.querySelector(`[data-index='${activeRef.current}']`)?.scrollIntoView({ block: 'nearest' });
	}, [active]);

	if (error) {
		return (
			<div ref={panelRef} className={`${styles.panel} ${styles.empty}`}>
				<span>文件加载失败：{error}</span>
				<button type="button" className={styles.retry} onClick={onRetry}>重试</button>
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div ref={panelRef} className={`${styles.panel} ${styles.empty}`}>
				{loading ? '正在扫描工作空间文件…' : '没有匹配的文件'}
			</div>
		);
	}

	return (
		<div ref={panelRef} className={styles.panel}>
			<div className={styles.header}>工作空间文件</div>
			<div className={styles.list} role="listbox" aria-label="文件候选">
				{results.map((row, i) => {
					const dir = row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : '';
					return (
						<button
							type="button"
							key={row.path}
							data-index={i}
							role="option"
							aria-selected={i === active}
							className={`${styles.item} ${i === active ? styles.active : ''}`}
							onMouseEnter={() => {
								activeRef.current = i;
								setActive(i);
							}}
							onClick={() => onPick(row)}
							title={row.path}
						>
							<FileText weight="regular" size={14} />
							<span className={styles.name}>{row.name}</span>
							<span className={styles.dir}>{dir}</span>
						</button>
					);
				})}
			</div>
			<div className={styles.footer}>
				<CornerDownLeft size={11} /> 添加到对话 · ↑↓ 移动 · Esc 关闭
				{truncated && <span className={styles.truncated}>文件较多，结果可能不完整</span>}
			</div>
		</div>
	);
}
