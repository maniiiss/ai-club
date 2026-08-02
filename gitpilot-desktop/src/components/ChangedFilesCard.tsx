/**
 * 改动文件卡片。
 *
 * 执行完成后展示本次执行实际编辑过的文件清单：
 * 每项显示 路径 + 状态标记(M/A/D) + 行数变化，点击可就地展开内联 diff（复用 CodeCard.DiffView）。
 * 无 diff 的项（write 工具）不可展开。
 */
import { useState } from 'react';
import { Folder } from 'lucide-react';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { DiffView } from './CodeCard';
import styles from './ChangedFilesCard.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

export function ChangedFilesCard({ files }: { files: ChangedFile[] }) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

	const toggle = (path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<Folder size={13} />
				<span>改动文件 · {files.length}</span>
			</div>
			<div className={styles.list}>
				{files.map((file) => {
					const isOpen = expanded.has(file.path);
					return (
						<div key={file.path}>
							<button
								type="button"
								className={`${styles.row} ${file.editable ? styles.rowEditable : ''}`}
								onClick={() => file.editable && toggle(file.path)}
							>
								<span className={`${styles.status} ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
								<span className={styles.path} title={file.path}>{file.path}</span>
								<span className={styles.stats}>
									{file.added > 0 && <span className={styles.statsAdd}>+{file.added}</span>}
									{file.removed > 0 && <span className={styles.statsDel}> -{file.removed}</span>}
								</span>
								{file.editable && <span className={styles.toggle}>{isOpen ? '▾' : '▸'}</span>}
							</button>
							{isOpen && file.diff && (
								<div className={styles.diffWrap}>
									<DiffView text={file.diff} />
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
