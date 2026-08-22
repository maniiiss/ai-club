/**
 * Code 右侧「Git」面板：受限 sidecar Git 操作。
 *
 * 业务意图：在现有右侧栏内完成"查看变更 → 暂存 → 提交 → 同步远程"闭环；
 * 所有操作经 store/git.ts 走类型化 git_* RPC，组件不直接执行 git 命令。
 * 布局：分支行（下拉查看/切换/新建 + 刷新/Fetch/拉取）+ ✓ 提交按钮；
 * 点击提交打开弹窗（圆角矩形、无横线），弹窗内分三部分：
 * ① 提交信息输入框（留空提交时由 sidecar 一次性模型会话生成，Ctrl+Enter 快捷提交）
 * ② "包含未暂存的更改"开关 + 提交范围总统计（只显示统计，不展开代码）
 * ③ 提交 / 提交并推送 / 推送 操作按钮
 * 面板下方为可折叠变更分组（冲突/未暂存/已暂存/未跟踪/被忽略的已跟踪），
 * 行内只显示 ±统计；误跟踪文件的改动不进入自动暂存路径，行内提供解除跟踪。
 */
import { GitBranch, ArrowClockwise, DownloadSimple, Plus, X, ChatText, Warning, GitMerge, CircleNotch, CaretDown, Check, CheckCircle, SpinnerGap, FileX } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { useGitStore } from '@/src/store/git';
import type { GitChangeCounts, GitFileStatus } from '@/src/rpc/types';
import styles from './TargetGitPanel.module.css';

interface ChangeRow {
	file: GitFileStatus;
	letter: string;
	letterClass: string;
	/** 该分组视角下的增删行数：已暂存组取暂存区统计，其余取工作区统计。 */
	counts: GitChangeCounts | null;
}

const LETTER_CLASS: Record<string, string> = {
	M: styles.letterModified,
	A: styles.letterAdded,
	D: styles.letterDeleted,
	R: styles.letterRenamed,
	C: styles.letterAdded,
	U: styles.letterConflict,
	'?': styles.letterUntracked,
};

function rowOf(file: GitFileStatus, staged: boolean, letter: string): ChangeRow {
	return { file, letter, letterClass: LETTER_CLASS[letter] ?? styles.letterModified, counts: staged ? file.stagedCounts : file.worktreeCounts };
}

/** 把 porcelain 状态拆为 冲突/未暂存/已暂存/未跟踪/被忽略的已跟踪 五组；同一文件可同时出现在已暂存与未暂存。 */
export function groupGitFiles(files: GitFileStatus[]): { conflicted: ChangeRow[]; unstaged: ChangeRow[]; staged: ChangeRow[]; untracked: ChangeRow[]; ignoredTracked: ChangeRow[] } {
	const conflicted: ChangeRow[] = [];
	const unstaged: ChangeRow[] = [];
	const staged: ChangeRow[] = [];
	const untracked: ChangeRow[] = [];
	const ignoredTracked: ChangeRow[] = [];
	for (const file of files) {
		if (file.conflicted) {
			conflicted.push(rowOf(file, false, 'U'));
			continue;
		}
		// 误跟踪文件单独分组：改动不进入自动暂存路径，防止被一键提交悄悄带上；
		// 已被手动暂存的留在已暂存组，尊重用户显式操作。
		if (file.ignoredTracked && !file.staged) {
			ignoredTracked.push({ ...rowOf(file, false, file.worktree ?? 'M'), letterClass: styles.letterIgnored });
			continue;
		}
		if (file.staged) staged.push(rowOf(file, true, file.staged));
		if (file.worktree) unstaged.push(rowOf(file, false, file.worktree));
		if (file.untracked) untracked.push(rowOf(file, false, '?'));
	}
	return { conflicted, unstaged, staged, untracked, ignoredTracked };
}

/** 汇总一组行的增删行数；无任何统计时返回 null（如全部未跟踪）。 */
export function sumRowCounts(rows: ChangeRow[]): GitChangeCounts | null {
	let added = 0;
	let removed = 0;
	let seen = false;
	for (const row of rows) {
		if (!row.counts) continue;
		seen = true;
		added += row.counts.added;
		removed += row.counts.removed;
	}
	return seen ? { added, removed } : null;
}

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}

/** 行内 ±统计：新增绿色、删除红色，等宽字体右对齐，是文件行的主信息。 */
function CountStats({ counts }: { counts: GitChangeCounts | null }) {
	if (!counts) return <span className={styles.stats} aria-label="行数未知">±?</span>;
	return <span className={styles.stats}>
		{counts.added > 0 && <span className={styles.statsAdd}>+{formatCount(counts.added)}</span>}
		{counts.removed > 0 && <span className={styles.statsDel}>-{formatCount(counts.removed)}</span>}
		{counts.added === 0 && counts.removed === 0 && <span className={styles.statsMuted}>±0</span>}
	</span>;
}

/** 变更行：状态字母 + 路径（省略号）+ ±统计 + 行内暂存操作；不展开代码，只显示统计。 */
function ChangeItem({ row, busy, onStage, onUnstage, onAskAgent, onUntrack }: {
	row: ChangeRow;
	busy: boolean;
	onStage: (row: ChangeRow) => void;
	onUnstage: (row: ChangeRow) => void;
	onAskAgent: (row: ChangeRow) => void;
	/** 误跟踪分组传入：行内只提供解除跟踪，不提供暂存入口。 */
	onUntrack?: (row: ChangeRow) => void;
}) {
	const ignoredTracked = onUntrack !== undefined && row.file.ignoredTracked === true && !row.file.staged;
	return (
		<div className={styles.rowWrap}>
			<div className={styles.row}>
				<span className={`${styles.letter} ${row.letterClass}`}>{row.letter}</span>
				<Hint content={row.file.path}><span className={styles.path}>{row.file.path}</span></Hint>
				{row.file.untracked
					? <span className={styles.statsMuted}>新文件</span>
					: <CountStats counts={row.counts} />}
			</div>
			<div className={styles.rowActions}>
				{ignoredTracked
					? <Hint content="解除跟踪（保留本地文件，提交删除后忽略才生效）"><Button type="button" variant="ghost" size="icon-sm" className={styles.action} disabled={busy} onClick={() => onUntrack?.(row)} aria-label={`解除跟踪 ${row.file.path}`}><FileX weight="regular" size={13} /></Button></Hint>
					: row.file.conflicted
						? <Hint content="交给 Agent 分析冲突"><Button type="button" variant="ghost" size="icon-sm" className={styles.action} onClick={() => onAskAgent(row)} aria-label={`分析冲突 ${row.file.path}`}><ChatText weight="regular" size={13} /></Button></Hint>
						: row.file.staged && !row.file.worktree
							? <Hint content="取消暂存"><Button type="button" variant="ghost" size="icon-sm" className={styles.action} disabled={busy} onClick={() => onUnstage(row)} aria-label={`取消暂存 ${row.file.path}`}><X weight="regular" size={13} /></Button></Hint>
							: <Hint content="暂存"><Button type="button" variant="ghost" size="icon-sm" className={styles.action} disabled={busy} onClick={() => onStage(row)} aria-label={`暂存 ${row.file.path}`}><Plus weight="regular" size={13} /></Button></Hint>}
			</div>
		</div>
	);
}

/** 可折叠变更分组：标题右侧展示行数与该组 ±合计。 */
function ChangeGroup({ id, title, rows, collapsed, onToggleCollapse, children }: {
	id: string;
	title: string;
	rows: ChangeRow[];
	collapsed: boolean;
	onToggleCollapse: (id: string) => void;
	children: (row: ChangeRow, index: number) => React.ReactNode;
}) {
	const total = sumRowCounts(rows);
	return (
		<section className={styles.group} aria-label={title}>
			<button type="button" className={styles.groupHeader} onClick={() => onToggleCollapse(id)} aria-expanded={!collapsed}>
				<span className={styles.groupCaret}>{collapsed ? '▸' : '▾'}</span>
				<span className={styles.groupTitle}>{title}</span>
				{total && <span className={styles.groupStats}><span className={styles.statsAdd}>+{formatCount(total.added)}</span><span className={styles.statsDel}>-{formatCount(total.removed)}</span></span>}
				<small>{rows.length > 0 ? rows.length : '无'}</small>
			</button>
			{!collapsed && rows.map((row, index) => children(row, index))}
		</section>
	);
}

/** Code 右侧 Git 面板：状态、暂存/提交、分支与远程同步的自包含面板。 */
export function TargetGitPanel() {
	const workspacePath = useSessionStore((s) => s.currentProjectPath);
	const state = useGitStore((s) => s.state);
	const loading = useGitStore((s) => s.loading);
	const error = useGitStore((s) => s.error);
	const busy = useGitStore((s) => s.busy);
	const lastActionError = useGitStore((s) => s.lastActionError);
	const branches = useGitStore((s) => s.branches);
	const refresh = useGitStore((s) => s.refresh);
	const loadBranches = useGitStore((s) => s.loadBranches);
	const stagePaths = useGitStore((s) => s.stagePaths);
	const unstagePaths = useGitStore((s) => s.unstagePaths);
	const untrackPaths = useGitStore((s) => s.untrackPaths);
	const commit = useGitStore((s) => s.commit);
	const suggestCommitMessage = useGitStore((s) => s.suggestCommitMessage);
	const createBranch = useGitStore((s) => s.createBranch);
	const switchBranch = useGitStore((s) => s.switchBranch);
	const fetchRemote = useGitStore((s) => s.fetchRemote);
	const pullFfOnly = useGitStore((s) => s.pullFfOnly);
	const push = useGitStore((s) => s.push);
	const clearActionError = useGitStore((s) => s.clearActionError);
	const setComposerPrefill = useWorkbenchStore((s) => s.setComposerPrefill);

	// 分组默认折叠策略：冲突与未暂存默认展开（需要第一时间处理），已暂存与未跟踪默认收起。
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['staged', 'untracked']));
	// 提交弹窗：提交信息、是否包含未暂存更改（默认包含，VS Code 式一键提交全部）。
	const [commitOpen, setCommitOpen] = useState(false);
	const [commitMessage, setCommitMessage] = useState('');
	const [includeUnstaged, setIncludeUnstaged] = useState(true);
	/** 弹窗按钮态：AI 生成中 / 提交中 / 推送中。 */
	const [commitBusy, setCommitBusy] = useState<'none' | 'suggest' | 'commit' | 'push'>('none');
	const [branchName, setBranchName] = useState('');
	const [branchSwitchTo, setBranchSwitchTo] = useState(true);
	const [confirmCreateBranch, setConfirmCreateBranch] = useState(false);
	const [pendingSwitchBranch, setPendingSwitchBranch] = useState<string | null>(null);

	// 打开页签/切换工作空间时刷新状态与分支；面板挂载期间 5s 轮询兜底外部变化。
	useEffect(() => {
		void refresh(workspacePath);
		void loadBranches();
	}, [refresh, loadBranches, workspacePath]);

	useEffect(() => {
		if (!workspacePath) return;
		const timer = setInterval(() => {
			if (!useGitStore.getState().busy) void refresh(useGitStore.getState().workspacePath);
		}, 5_000);
		return () => clearInterval(timer);
	}, [refresh, workspacePath]);

	const groups = useMemo(() => groupGitFiles(state?.files ?? []), [state?.files]);
	/** 可随"包含未暂存的更改"一并提交的行：未暂存 + 未跟踪（冲突必须人工解决，不自动暂存）。 */
	const stageableRows = useMemo(() => [...groups.unstaged, ...groups.untracked], [groups.unstaged, groups.untracked]);
	/** 提交范围与总统计：勾选包含未暂存时覆盖全部本地改动。 */
	const commitScopeRows = useMemo(
		() => (includeUnstaged ? [...groups.staged, ...stageableRows] : groups.staged),
		[includeUnstaged, groups.staged, stageableRows],
	);
	const commitScopeTotal = useMemo(() => sumRowCounts(commitScopeRows), [commitScopeRows]);
	const localBranches = branches.filter((branch) => branch.kind === 'local');
	const remoteBranches = branches.filter((branch) => branch.kind === 'remote');
	const noUpstream = state !== null && !state.detached && state.branch !== null && !state.upstream;
	const upstreamLabel = state?.upstream && (!state.branch || !state.upstream.endsWith(`/${state.branch}`)) ? state.upstream : null;
	const toggleGroup = (id: string) => {
		setCollapsedGroups((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	/** 冲突/失败交给 Agent 分析：只预填对话指令，用户确认后才发送。 */
	const prefillConflictAnalysis = (detail: string) => {
		setComposerPrefill([
			'Git 面板遇到了以下问题，请帮我分析原因并给出处理建议（先只读分析，不要直接修改文件）：',
			'',
			detail,
		].join('\n'));
	};

	/**
	 * 内联提交（输入框 Ctrl+Enter 同效）：勾选"包含未暂存"时先补暂存再提交；
	 * 提交信息留空时由 AI 生成后直接提交；alsoPush 提交成功后继续推送
	 * （无上游时自动设置上游；失败以面板错误条提示，不弹窗）。
	 */
	const runCommit = async (alsoPush: boolean) => {
		if (commitScopeRows.length === 0) return;
		setCommitBusy(alsoPush ? 'push' : 'commit');
		try {
			if (includeUnstaged && stageableRows.length > 0) {
				if (!(await stagePaths(stageableRows.map((row) => row.file.path)))) return;
			}
			let message = commitMessage.trim();
			if (!message) {
				setCommitBusy('suggest');
				message = await suggestCommitMessage() ?? '';
				if (!message) return;
				setCommitMessage(message);
				setCommitBusy(alsoPush ? 'push' : 'commit');
			}
			if (!(await commit(message))) return;
			setCommitMessage('');
			setCommitOpen(false);
			if (alsoPush) await push(noUpstream ? true : undefined);
		} finally {
			setCommitBusy('none');
		}
	};

	/** 单独推送已有提交；无上游时自动设置上游。 */
	const runPushOnly = async () => {
		setCommitBusy('push');
		try {
			await push(noUpstream ? true : undefined);
		} finally {
			setCommitBusy('none');
		}
	};

	const anyBusy = Boolean(busy) || commitBusy !== 'none';
	const emptyBody = !workspacePath
		? { icon: <GitBranch size={21} />, title: '尚未选择工作空间', hint: '选择 Code 工作空间后，这里会显示仓库状态。' }
		: error
			? { icon: <Warning size={21} />, title: error, hint: '对话与终端不受影响；可切换工作空间或检查 git 环境。' }
			: { icon: <CircleNotch weight="bold" size={20} className={styles.spin} />, title: '正在读取仓库状态…', hint: '' };

	return (
		<section className={styles.panel} aria-label="Git 面板">
			<header className={styles.header}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="ghost" size="sm" className={styles.branchTrigger} disabled={!state} aria-label="查看与切换分支">
							<GitBranch weight="regular" size={15} />
							<span className={styles.branchName}>{state ? (state.detached ? '（detached）' : state.branch) : '—'}</span>
							{upstreamLabel && <span className={styles.upstream}>{upstreamLabel}</span>}
							{state && state.ahead > 0 && <span className={styles.ahead}>↑{state.ahead}</span>}
							{state && state.behind > 0 && <span className={styles.behind}>↓{state.behind}</span>}
							<CaretDown weight="bold" size={12} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className={styles.branchMenu}>
						<DropdownMenuItem onSelect={() => { setBranchName(''); setBranchSwitchTo(true); setConfirmCreateBranch(true); }}><Plus weight="regular" />新建分支…</DropdownMenuItem>
						<DropdownMenuSeparator />
						{localBranches.map((branch) => (
							<DropdownMenuItem key={branch.name} disabled={Boolean(busy)} onSelect={() => { if (!branch.current) setPendingSwitchBranch(branch.name); }}>
								<span className={styles.branchMenuCheck}>{branch.current ? <Check weight="bold" size={13} /> : null}</span>
								<span className={styles.branchMenuName}>{branch.name}</span>
							</DropdownMenuItem>
						))}
						{remoteBranches.length > 0 && <DropdownMenuSeparator />}
						{remoteBranches.map((branch) => (
							<DropdownMenuItem key={branch.name} disabled className={styles.branchMenuRemote}>
								<span className={styles.branchMenuCheck} />
								<span className={styles.branchMenuName}>{branch.name}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<div className={styles.headerActions}>
					<Hint content="刷新状态"><Button type="button" variant="ghost" size="icon-sm" onClick={() => { void refresh(workspacePath); void loadBranches(); }} disabled={loading} aria-label="刷新 Git 状态"><ArrowClockwise weight="regular" size={15} className={loading ? styles.spin : ''} /></Button></Hint>
					<Hint content="Fetch 远程（只更新远程跟踪分支，不改本地）"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void fetchRemote()} disabled={!state || busy === 'fetch' || (!state.upstream && remoteBranches.length === 0)} aria-label="Fetch 远程">{busy === 'fetch' ? <SpinnerGap weight="bold" size={15} className={styles.spin} /> : <DownloadSimple weight="regular" size={15} />}</Button></Hint>
					<Hint content="拉取远程更新（仅快进；没有落后提交时置灰）"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void pullFfOnly()} disabled={!state || Boolean(busy) || !state.upstream || state.behind === 0} aria-label="拉取远程更新">{busy === 'pull' ? <SpinnerGap weight="bold" size={15} className={styles.spin} /> : <GitMerge weight="regular" size={15} />}</Button></Hint>
					<Hint content="提交（弹窗内可选 提交 / 提交并推送 / 推送）">
						<Button type="button" variant="ghost" size="icon-sm" onClick={() => { setCommitMessage(''); setCommitBusy('none'); setCommitOpen(true); }} disabled={!state || anyBusy || (commitScopeRows.length === 0 && state.ahead === 0 && !noUpstream)} aria-label="提交">
							{busy === 'commit' || busy === 'push' ? <SpinnerGap weight="bold" size={15} className={styles.spin} /> : <CheckCircle weight="regular" size={15} />}
						</Button>
					</Hint>
				</div>
			</header>

			<Dialog open={commitOpen} onOpenChange={(open) => { if (!open && commitBusy === 'none') setCommitOpen(false); }}>
				<DialogContent>
					<DialogHeader className={styles.dialogHeaderBare}><DialogTitle>提交</DialogTitle><DialogDescription>{commitScopeRows.length} 个文件在提交范围内，留空提交信息将由 AI 生成。</DialogDescription></DialogHeader>
					<div className={styles.confirmBody}>
						<textarea
							className={styles.commitInput}
							value={commitMessage}
							onChange={(event) => setCommitMessage(event.target.value)}
							onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void runCommit(false); } }}
							placeholder="提交信息（留空将自动生成）…"
							aria-label="提交信息"
							rows={3}
						/>
						<label className={styles.commitSummaryRow}>
							<input type="checkbox" checked={includeUnstaged} onChange={(event) => setIncludeUnstaged(event.target.checked)} />
							<span className={styles.commitSummaryLabel}>包含未暂存的更改</span>
							{commitScopeTotal && (
								<span className={styles.commitSummaryStats}>
									<span className={styles.statsAdd}>+{formatCount(commitScopeTotal.added)}</span>
									<span className={styles.statsDel}>-{formatCount(commitScopeTotal.removed)}</span>
								</span>
							)}
						</label>
						{groups.conflicted.length > 0 && (
							<div className={styles.commitConflictHint}>
								<Warning weight="regular" size={12} />
								{groups.conflicted.length} 个冲突文件需先解决，不包含在本次提交中
							</div>
						)}
						{groups.ignoredTracked.length > 0 && (
							<div className={styles.commitConflictHint}>
								<Warning weight="regular" size={12} />
								{groups.ignoredTracked.length} 个被忽略的已跟踪文件已自动跳过，不会被提交
							</div>
						)}
					</div>
					<DialogFooter className={styles.dialogFooterBare}>
						<Button type="button" size="sm" variant="ghost" className={styles.dialogFooterLeft} onClick={() => void runPushOnly()} disabled={!state || anyBusy || (state.ahead === 0 && !noUpstream)}>
							{commitBusy === 'push' && commitScopeRows.length === 0 ? '推送中…' : `推送${state && state.ahead > 0 ? `（${state.ahead} 个提交）` : ''}`}
						</Button>
						<Button type="button" size="sm" variant="secondary" onClick={() => void runCommit(false)} disabled={commitScopeRows.length === 0 || anyBusy}>
							{commitBusy === 'suggest' ? 'AI 生成中…' : commitBusy === 'commit' ? '提交中…' : '提交'}
						</Button>
						<Button type="button" size="sm" onClick={() => void runCommit(true)} disabled={commitScopeRows.length === 0 || anyBusy}>
							{commitBusy === 'push' && commitScopeRows.length > 0 ? '提交并推送中…' : '提交并推送'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{lastActionError && (
				<div className={styles.actionError} role="alert">
					<Warning weight="regular" size={14} />
					<span>{lastActionError}</span>
					<Button type="button" variant="ghost" size="sm" onClick={() => prefillConflictAnalysis(lastActionError)}>交给 Agent 分析</Button>
					<Button type="button" variant="ghost" size="icon-sm" onClick={clearActionError} aria-label="关闭错误提示"><X weight="bold" size={12} /></Button>
				</div>
			)}

			{!state ? (
				<div className={styles.empty}>
					{emptyBody.icon}
					<strong>{emptyBody.title}</strong>
					{emptyBody.hint && <span>{emptyBody.hint}</span>}
					{error && <Button type="button" size="sm" variant="secondary" onClick={() => void refresh(workspacePath)}>重试</Button>}
				</div>
			) : (
				<ScrollArea className={styles.body} aria-label="Git 变更列表">
					<div className={styles.list}>
						<ChangeGroup id="conflicted" title="冲突" rows={groups.conflicted} collapsed={collapsedGroups.has('conflicted')} onToggleCollapse={toggleGroup}>
							{(row, index) => <ChangeItem key={`conflict-${index}`} row={row} busy={Boolean(busy)} onStage={() => {}} onUnstage={() => {}} onAskAgent={(item) => prefillConflictAnalysis(`文件存在合并冲突：${item.file.path}`)} />}
						</ChangeGroup>
						<ChangeGroup id="unstaged" title="未暂存" rows={groups.unstaged} collapsed={collapsedGroups.has('unstaged')} onToggleCollapse={toggleGroup}>
							{(row, index) => <ChangeItem key={`unstaged-${index}`} row={row} busy={Boolean(busy)} onStage={(item) => void stagePaths([item.file.path])} onUnstage={() => {}} onAskAgent={() => {}} />}
						</ChangeGroup>
						<ChangeGroup id="staged" title="已暂存" rows={groups.staged} collapsed={collapsedGroups.has('staged')} onToggleCollapse={toggleGroup}>
							{(row, index) => <ChangeItem key={`staged-${index}`} row={row} busy={Boolean(busy)} onStage={() => {}} onUnstage={(item) => void unstagePaths([item.file.path])} onAskAgent={() => {}} />}
						</ChangeGroup>
						<ChangeGroup id="untracked" title="未跟踪" rows={groups.untracked} collapsed={collapsedGroups.has('untracked')} onToggleCollapse={toggleGroup}>
							{(row, index) => <ChangeItem key={`untracked-${index}`} row={row} busy={Boolean(busy)} onStage={(item) => void stagePaths([item.file.path])} onUnstage={() => {}} onAskAgent={() => {}} />}
						</ChangeGroup>
						<ChangeGroup id="ignoredTracked" title="被忽略的已跟踪" rows={groups.ignoredTracked} collapsed={collapsedGroups.has('ignoredTracked')} onToggleCollapse={toggleGroup}>
							{(row, index) => <ChangeItem key={`ignored-${index}`} row={row} busy={Boolean(busy)} onStage={() => {}} onUnstage={() => {}} onAskAgent={() => {}} onUntrack={(item) => void untrackPaths([item.file.path])} />}
						</ChangeGroup>
					</div>
				</ScrollArea>
			)}

			<Dialog open={confirmCreateBranch} onOpenChange={setConfirmCreateBranch}>
				<DialogContent>
					<DialogHeader><DialogTitle>新建分支</DialogTitle><DialogDescription>基于当前 HEAD 创建分支。</DialogDescription></DialogHeader>
					<div className={styles.confirmBody}>
						<input className={styles.branchInput} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="分支名，如 feature/x" aria-label="新分支名" />
						<label className={styles.branchOption}><input type="checkbox" checked={branchSwitchTo} onChange={(event) => setBranchSwitchTo(event.target.checked)} />创建后切换到该分支</label>
					</div>
					<DialogFooter>
						<Button type="button" variant="secondary" size="sm" onClick={() => setConfirmCreateBranch(false)}>取消</Button>
						<Button type="button" size="sm" disabled={!branchName.trim() || Boolean(busy)} onClick={async () => { setConfirmCreateBranch(false); if (await createBranch(branchName, branchSwitchTo)) void loadBranches(); }}>创建</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={pendingSwitchBranch !== null} onOpenChange={(open) => { if (!open) setPendingSwitchBranch(null); }}>
				<DialogContent>
					<DialogHeader><DialogTitle>切换分支</DialogTitle><DialogDescription>切换到 {pendingSwitchBranch ?? ''}；本地未提交变更若会被覆盖，Git 会阻断该操作。</DialogDescription></DialogHeader>
					<DialogFooter>
						<Button type="button" variant="secondary" size="sm" onClick={() => setPendingSwitchBranch(null)}>取消</Button>
						<Button type="button" size="sm" onClick={async () => { const target = pendingSwitchBranch; setPendingSwitchBranch(null); if (target && await switchBranch(target)) void loadBranches(); }}>切换</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
