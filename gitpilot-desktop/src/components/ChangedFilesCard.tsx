/**
 * 改动文件项与卡片。
 *
 * ChangedFileItem：状态标记 + 路径 + 行数变化，点击在右侧「审查」页签中打开该文件 diff。
 * 供任务结束后的改动文件结果卡片使用。
 */
import { CaretDown, CaretUp, Folder } from '@phosphor-icons/react';
import { useState } from 'react';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { useReviewStore } from '@/src/store/review';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './ChangedFilesCard.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

/** 单个改动文件项：状态徽章 + 路径 + 行数变化，点击打开右侧审查页签并展开该文件 diff。 */
export function ChangedFileItem({ file }: { file: ChangedFile }) {
	return (
		<div>
			<Button
				type="button"
				variant="unstyled"
				className={`${styles.row} ${styles.rowEditable}`}
				onClick={() => useReviewStore.getState().openReviewFile(file.path)}
			>
				<span className={`${styles.status} ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
				<Hint content={file.path}><span className={styles.path}>{file.path}</span></Hint>
				<span className={styles.stats}>
					{file.added > 0 && <span className={styles.statsAdd}>+{file.added}</span>}
					{file.removed > 0 && <span className={styles.statsDel}> -{file.removed}</span>}
				</span>
				{file.editable ? <span className={styles.toggle}>▸</span> : <span className={styles.noDiff}>无文本 diff</span>}
			</Button>
		</div>
	);
}

/** 任务结束后的改动文件卡片：汇总增删行数，并按需展开完整文件列表。 */
export function ChangedFilesCard({ files }: { files: ChangedFile[] }) {
	const [expanded, setExpanded] = useState(false);
	const added = files.reduce((total, file) => total + file.added, 0);
	const removed = files.reduce((total, file) => total + file.removed, 0);
	// 文件较多时先保留前三项，避免最终结果卡一次性占满对话视口。
	const visibleFiles = expanded ? files : files.slice(0, 3);
	const hiddenCount = files.length - visibleFiles.length;
	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<Folder weight="regular" size={13} />
				<span>已编辑 {files.length} 个文件</span>
				<span className={styles.headerStats}>
					{added > 0 && <span className={styles.statsAdd}>+{added}</span>}
					{removed > 0 && <span className={styles.statsDel}> -{removed}</span>}
				</span>
			</div>
			<div className={styles.list}>
				{visibleFiles.map((file) => <ChangedFileItem key={file.path} file={file} />)}
			</div>
			{files.length > 3 && (
				<Button type="button" variant="unstyled" size="sm" className={styles.more} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
					{expanded ? <CaretUp weight="bold" size={13} aria-hidden="true" /> : <CaretDown weight="bold" size={13} aria-hidden="true" />}
					<span>{expanded ? '收起文件' : `再显示 ${hiddenCount} 个文件`}</span>
				</Button>
			)}
		</div>
	);
}
