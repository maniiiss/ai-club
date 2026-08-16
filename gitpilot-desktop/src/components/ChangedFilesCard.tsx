/**
 * 改动文件项与卡片。
 *
 * ChangedFileItem：状态标记 + 路径 + 行数变化，点击展开内联 diff。
 * 供 ChangedFilesCard 卡片与 ExecutionBatch 编辑文件区复用。
 */
import { useState } from 'react';
import { Folder } from 'lucide-react';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { DiffView } from './CodeCard';
import styles from './ChangedFilesCard.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

/** 单个改动文件项：状态徽章 + 路径 + 行数变化，可点击展开内联 diff。 */
export function ChangedFileItem({ file }: { file: ChangedFile }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div>
			<Button
				type="button"
				variant="unstyled"
				className={`${styles.row} ${file.editable ? styles.rowEditable : ''}`}
				onClick={() => file.editable && setExpanded((v) => !v)}
			>
				<span className={`${styles.status} ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
				<Hint content={file.path}><span className={styles.path}>{file.path}</span></Hint>
				<span className={styles.stats}>
					{file.added > 0 && <span className={styles.statsAdd}>+{file.added}</span>}
					{file.removed > 0 && <span className={styles.statsDel}> -{file.removed}</span>}
				</span>
				{file.editable && <span className={styles.toggle}>{expanded ? '▾' : '▸'}</span>}
			</Button>
			{expanded && file.diff && (
				<div className={styles.diffWrap}>
					<DiffView text={file.diff} />
				</div>
			)}
		</div>
	);
}

/** 改动文件卡片：外层卡片 + header“改动文件·N” + 文件项列表。 */
export function ChangedFilesCard({ files }: { files: ChangedFile[] }) {
	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<Folder size={13} />
				<span>改动文件 · {files.length}</span>
			</div>
			<div className={styles.list}>
				{files.map((file) => <ChangedFileItem key={file.path} file={file} />)}
			</div>
		</div>
	);
}
