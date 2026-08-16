import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, CloudUpload, FileCode2, History, RotateCcw, Upload, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import type { DesignSnapshot } from '@/src/design/design-types';
import { rpc } from '@/src/rpc/bridge';
import { useDesignStore } from '@/src/store/design';
import styles from './DesignVersionManager.module.css';

type PlatformProject = { id: number; name: string; status?: string };
type Confirmation = 'revert' | 'upload' | null;

function formatTime(value: string): string {
	const time = Date.parse(value);
	return Number.isFinite(time) ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : value;
}

function snapshotSize(snapshot: DesignSnapshot | null): number {
	if (!snapshot) return 0;
	return new Blob([JSON.stringify({ document: snapshot.document, files: snapshot.files, guidelines: snapshot.guidelines })]).size;
}

function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 版本管理只从历史 RPC 读取指定快照，选择时间线项不会替换工作台当前 snapshot。
 * 真正回滚和上传都延迟至确认弹窗的最终提交，防止误操作影响本地或远端状态。
 */
export function DesignVersionManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const snapshot = useDesignStore((state) => state.snapshot);
	const getRevision = useDesignStore((state) => state.getRevision);
	const revertToRevision = useDesignStore((state) => state.revertToRevision);
	const uploadRevision = useDesignStore((state) => state.uploadRevision);
	const uploadRecords = useDesignStore((state) => state.uploadRecords);
	const revisions = useMemo(() => [...snapshot.document.revisions].reverse(), [snapshot.document.revisions]);
	const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
	const [historicalSnapshot, setHistoricalSnapshot] = useState<DesignSnapshot | null>(null);
	const [projects, setProjects] = useState<PlatformProject[]>([]);
	const [platformProjectId, setPlatformProjectId] = useState('');
	const [title, setTitle] = useState('');
	const [summary, setSummary] = useState('');
	const [loadingRevision, setLoadingRevision] = useState(false);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [confirmation, setConfirmation] = useState<Confirmation>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		const latest = revisions[0];
		setSelectedRevisionId((current) => current && revisions.some((revision) => revision.id === current) ? current : latest?.id ?? null);
		setError(null);
	}, [open, revisions]);

	useEffect(() => {
		if (!open || !selectedRevisionId) return;
		let cancelled = false;
		setLoadingRevision(true);
		setError(null);
		void getRevision(selectedRevisionId)
			.then((value) => { if (!cancelled) setHistoricalSnapshot(value); })
			.catch((cause) => { if (!cancelled) { setHistoricalSnapshot(null); setError(cause instanceof Error ? cause.message : String(cause)); } })
			.finally(() => { if (!cancelled) setLoadingRevision(false); });
		return () => { cancelled = true; };
	}, [getRevision, open, selectedRevisionId]);

	useEffect(() => {
		if (!open || projects.length > 0) return;
		let cancelled = false;
		setLoadingProjects(true);
		void rpc.getPlatformProjects()
			.then((response) => {
				if (cancelled) return;
				if (!response.success || response.command !== 'get_platform_projects') throw new Error(response.success ? '未获取到 Web 项目列表' : response.error);
				setProjects(response.data.projects);
				setPlatformProjectId((current) => current || String(response.data.projects[0]?.id ?? ''));
			})
			.catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); })
			.finally(() => { if (!cancelled) setLoadingProjects(false); });
		return () => { cancelled = true; };
	}, [open, projects.length]);

	const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? null;
	const selectedSize = snapshotSize(historicalSnapshot);
	const existingUpload = selectedRevisionId ? uploadRecords.find((record) => record.revisionId === selectedRevisionId && record.projectId === Number(platformProjectId)) : undefined;
	const selectRevision = (revisionId: string) => {
		setSelectedRevisionId(revisionId);
		setTitle('');
		setSummary('');
	};
	const close = () => { if (!submitting) onOpenChange(false); };
	const canUpload = Boolean(selectedRevisionId && historicalSnapshot && Number(platformProjectId) > 0 && selectedSize <= 10 * 1024 * 1024);

	const performConfirmation = async () => {
		if (!selectedRevisionId || !confirmation) return;
		setSubmitting(true);
		setError(null);
		try {
			if (confirmation === 'revert') {
				await revertToRevision(selectedRevisionId);
				onOpenChange(false);
			} else {
				await uploadRevision({ revisionId: selectedRevisionId, platformProjectId: Number(platformProjectId), title: title.trim() || undefined, summary: summary.trim() || undefined });
			}
			setConfirmation(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSubmitting(false);
		}
	};

	return <>
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className={styles.dialog} aria-describedby={undefined}>
				<DialogHeader className={styles.header}>
					<DialogTitle><History size={16} />版本管理</DialogTitle>
					<DialogDescription>历史快照只读；回滚会创建新的当前修订。</DialogDescription>
				</DialogHeader>
				<div className={styles.layout}>
					<aside className={styles.timeline} aria-label="本地修订时间线">
						<div className={styles.timelineTitle}><span>本地修订</span><small>{revisions.length}</small></div>
						<div className={styles.timelineList}>{revisions.map((revision, index) => <button type="button" key={revision.id} className={`${styles.revisionItem} ${selectedRevisionId === revision.id ? styles.revisionItemActive : ''}`} onClick={() => selectRevision(revision.id)}>
							<span className={styles.revisionIndex}>v{snapshot.document.version - index}</span><span className={styles.revisionBody}><strong>{revision.summary || '未命名设计修订'}</strong><small>{formatTime(revision.createdAt)}</small></span>{revision.kind === 'rollback' && <RotateCcw size={12} aria-label="回滚修订" />}
						</button>)}</div>
					</aside>
					<section className={styles.detail}>
						{selectedRevision ? <><div className={styles.detailHeading}><div><span>修订详情</span><h3>{selectedRevision.summary || selectedRevision.id}</h3></div><code>{selectedRevision.id}</code></div>
							<div className={styles.metaGrid}><span>创建时间<strong>{formatTime(selectedRevision.createdAt)}</strong></span><span>文件数量<strong>{historicalSnapshot?.files.length ?? '-'} 个</strong></span><span>快照大小<strong>{historicalSnapshot ? formatBytes(selectedSize) : '-'}</strong></span><span>来源<strong>{selectedRevision.kind === 'rollback' ? `回滚 ${selectedRevision.sourceRevisionId ?? ''}` : selectedRevision.kind === 'initial' ? '初始创建' : '设计修改'}</strong></span></div>
							<div className={styles.fileList}><div><FileCode2 size={14} /><span>文件清单</span></div>{loadingRevision ? <p>读取历史快照...</p> : historicalSnapshot?.files.map((file) => <code key={file.path}>{file.path}</code>)}</div>
							<div className={styles.actions}><Button type="button" size="sm" variant="outline" disabled={loadingRevision || submitting || !historicalSnapshot} onClick={() => setConfirmation('revert')}><RotateCcw />回滚到此修订</Button></div>
							<details className={styles.uploadPanel}><summary className={styles.uploadHeading}><CloudUpload size={15} /><div><strong>上传到 GitPilot Web</strong><span>{existingUpload ? `已上传为 Web 版本 v${existingUpload.versionNumber}` : '上传为项目草稿，不会激活版本'}</span></div><ChevronDown className={styles.uploadChevron} size={15} aria-hidden="true" /></summary><div className={styles.uploadBody}>
								<label>Web 项目<select value={platformProjectId} onChange={(event) => setPlatformProjectId(event.target.value)} disabled={loadingProjects || submitting}><option value="">{loadingProjects ? '正在读取项目...' : '选择 Web 项目'}</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}{project.status ? ` · ${project.status}` : ''}</option>)}</select></label>
								<label>版本标题<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={snapshot.document.name} disabled={submitting} /></label>
								<label>更新说明<textarea value={summary} maxLength={1000} onChange={(event) => setSummary(event.target.value)} placeholder={selectedRevision.summary} disabled={submitting} /></label>
								<div className={styles.uploadFooter}><span>{historicalSnapshot?.files.length ?? 0} 个文件 · {formatBytes(selectedSize)} / 10 MB</span><Button type="button" size="sm" disabled={!canUpload || submitting} onClick={() => setConfirmation('upload')}><Upload />{existingUpload ? '重新确认上传' : '上传草稿'}</Button></div>
							</div></details>
						</> : <p className={styles.empty}>当前设计还没有可管理的修订。</p>}
						{error && <p className={styles.error}>{error}</p>}
					</section>
				</div>
			</DialogContent>
		</Dialog>
		<Dialog open={confirmation !== null} onOpenChange={(next) => { if (!next && !submitting) setConfirmation(null); }}>
			<DialogContent className={styles.confirmation}>
				<DialogHeader><DialogTitle>{confirmation === 'revert' ? '确认回滚设计修订' : '确认上传设计修订'}</DialogTitle><DialogDescription>{confirmation === 'revert' ? `将以 ${selectedRevisionId} 的内容创建一个新的当前修订，已有历史不会删除。` : '将把选择的不可变历史快照上传为 Web 项目草稿。网络失败不会改动当前设计。'}</DialogDescription></DialogHeader>
				<DialogFooter><Button type="button" variant="ghost" disabled={submitting} onClick={() => setConfirmation(null)}><X />取消</Button><Button type="button" variant={confirmation === 'revert' ? 'outline' : 'default'} disabled={submitting} onClick={() => void performConfirmation()}>{confirmation === 'revert' ? <RotateCcw /> : <CheckCircle2 />}{submitting ? '处理中...' : '确认'}</Button></DialogFooter>
			</DialogContent>
		</Dialog>
	</>;
}
