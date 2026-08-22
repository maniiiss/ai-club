/**
 * Code 右侧「审查」面板：展示当前会话最近一轮任务的改动文件清单，
 * 点击文件行可展开/收起 unified diff（数据与聊天 changed_files 卡片同源）。
 *
 * 同一文件被多次编辑时逐轮展示全部 diff（每轮一个块），
 * 与卡片的累计行数统计口径保持一致。
 */
import { FolderOpen, GitDiff as FileDiff } from '@phosphor-icons/react';
import { useReviewStore } from '@/src/store/review';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { DiffView } from '@/src/components/CodeCard';
import styles from './TargetReviewPanel.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

/** 审查面板内单个改动文件行：状态徽章 + 路径 + 行数变化，点击展开逐轮 diff。 */
function ReviewFileItem({ file, expanded, onToggle }: { file: ChangedFile; expanded: boolean; onToggle: (path: string) => void }) {
	// 兼容旧数据：diffs 缺失时回退单次 diff；write 等无 diff 工具两者皆空。
	const rounds = file.diffs ?? (file.diff ? [file.diff] : []);
	const edits = rounds.length > 0 ? rounds : null;
	return (
		<div className={styles.item}>
			<Button
				type="button"
				variant="unstyled"
				className={`${styles.row} ${styles.rowEditable}`}
				onClick={() => onToggle(file.path)}
				aria-expanded={expanded}
			>
				<span className={`${styles.status} ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
				<Hint content={file.path}><span className={styles.path}>{file.path}</span></Hint>
				<span className={styles.stats}>
					{file.added > 0 && <span className={styles.statsAdd}>+{file.added}</span>}
					{file.removed > 0 && <span className={styles.statsDel}> -{file.removed}</span>}
				</span>
				{file.editable ? <span className={styles.toggle}>{expanded ? '▾' : '▸'}</span> : <span className={styles.noDiff}>无文本 diff</span>}
			</Button>
			{expanded && edits && (
				edits.map((diff, index) => (
					<div className={styles.diffRound} key={`${file.path}-${index}`}>
						{edits.length > 1 && <span className={styles.diffRoundLabel}>第 {index + 1} 次</span>}
						<div className={styles.diffWrap}>
							<DiffView text={diff} />
						</div>
					</div>
				))
			)}
		</div>
	);
}

/** Code 右侧审查面板：本轮改动文件的可折叠 diff 列表。 */
export function TargetReviewPanel() {
	const files = useReviewStore((s) => s.files);
	const expandedPaths = useReviewStore((s) => s.expandedPaths);
	const toggleReviewFile = useReviewStore((s) => s.toggleReviewFile);
	const added = files.reduce((total, file) => total + file.added, 0);
	const removed = files.reduce((total, file) => total + file.removed, 0);
	if (files.length === 0) {
		return (
			<div className={styles.empty}>
				<FileDiff size={18} />
				<span>暂无改动文件</span>
				<p>任务完成后可在此审查本轮编辑的文件。</p>
			</div>
		);
	}
	return (
		<ScrollArea className={styles.body} aria-label="本轮改动文件审查">
			<div className={styles.summary}>
				<FolderOpen size={13} />
				<span>本轮改动 {files.length} 个文件</span>
				<span className={styles.summaryStats}>
					{added > 0 && <span className={styles.statsAdd}>+{added}</span>}
					{removed > 0 && <span className={styles.statsDel}> -{removed}</span>}
				</span>
			</div>
			<div className={styles.list}>
				{files.map((file) => (
					<ReviewFileItem
						key={file.path}
						file={file}
						expanded={expandedPaths.includes(file.path)}
						onToggle={toggleReviewFile}
					/>
				))}
			</div>
		</ScrollArea>
	);
}
