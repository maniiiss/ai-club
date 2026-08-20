/**
 * 工作项协同浏览面板（Work 右侧栏“工作项协同”页签）。
 *
 * 业务意图：把 Web 端项目与工作项做只读分页浏览——数据经 sidecar 代理平台接口，
 * 渲染在右侧栏而不进模型上下文；用户点“发送到对话”时才把选中的单个工作项
 * 作为上下文注入对话，天然规避“全量拉取撑爆上下文”的问题。
 * 浏览态（过滤/页码/详情）只存组件内存，切换任务回来重新拉第一页，不做持久化。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bug, ChevronLeft, ChevronRight, ClipboardList, Loader2, Network, RefreshCw, Search, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rpc } from '@/src/rpc/bridge';
import type { RpcWorkItemDetail, RpcWorkItemListItem, RpcWorkItemPage, RpcWorkProjectSummary } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import styles from './TargetWorkShell.module.css';

/** 平台工作项的固定状态/类型枚举，与公众端 Web 保持一致。 */
const WORK_ITEM_STATUSES = ['待处理', '进行中', '已完成', '已关闭'] as const;
const WORK_ITEM_TYPES = ['需求', '任务', '缺陷'] as const;
const PAGE_SIZE = 20;

/** 详情态的数据包：主工作项 + 关联资源。 */
interface WorkItemDetailBundle {
	detail: RpcWorkItemDetail;
}

export interface WorkCollaborationPanelProps {
	/** 外部注入的刷新信号：模型写工作项后递增，面板自动重拉当前页。 */
	refreshKey: number;
	/** 用户在详情页点“发送到对话”：把选中的工作项交给输入框做上下文附件。 */
	onSendToConversation: (item: RpcWorkItemDetail) => void;
}

/**
 * 把选中的工作项序列化为注入对话的上下文块。
 *
 * Work 协议没有附件通道（work_prompt 只收 message 文本），因此详情以
 * `<work_item>` 块追加到用户消息之后——模型只消费这一项，天然避免全量拉取。
 */
export function buildWorkItemConversationContext(item: RpcWorkItemDetail): string {
	const type = item.taskType && item.workItemType === '任务' ? `${item.workItemType}/${item.taskType}` : item.workItemType;
	const lines = [
		`编号：${item.workItemCode}`,
		`名称：${item.name}`,
		`- 类型：${type || '工作项'}`,
		`- 状态：${item.status || '-'}`,
		`- 优先级：${item.priority || '-'}`,
		`- 负责人：${item.assignee || '未分配'}`,
	];
	if (item.creatorName) lines.push(`- 创建人：${item.creatorName}`);
	if (item.projectName) lines.push(`- 项目：${item.projectName}`);
	if (item.iterationName) lines.push(`- 迭代：${item.iterationName}`);
	if (item.moduleName) lines.push(`- 模块：${item.moduleName}`);
	if (item.planStartDate || item.planEndDate) lines.push(`- 计划周期：${item.planStartDate || '?'} ~ ${item.planEndDate || '?'}`);
	// Gitee 同步需求类工作项时会把同一份规范化正文同时写入 description 与 requirementMarkdown，重复时只保留“需求内容”。
	if (item.description?.trim() && item.requirementMarkdown?.trim() !== item.description.trim()) {
		lines.push('', '## 描述', item.description.trim());
	}
	if (item.requirementMarkdown?.trim()) {
		lines.push('', '## 需求内容', item.requirementMarkdown.trim());
	}
	return `<work_item>\n${lines.join('\n')}\n</work_item>`;
}

/** 状态徽章的语义色；未匹配的状态走默认中性色。 */
function statusTone(status: string): string {
	if (status === '已完成' || status === '已关闭') return styles.collabBadgeDone;
	if (status === '进行中') return styles.collabBadgeDoing;
	return styles.collabBadgeTodo;
}

/** 列表行：双行结构（标题行 + 状态/优先级/负责人元信息行），点击进入详情态。 */
function WorkItemRow({ item, onOpen }: { item: RpcWorkItemListItem; onOpen: (item: RpcWorkItemListItem) => void }) {
	const typeLabel = item.workItemType || '工作项';
	return <button type="button" className={styles.collabItem} onClick={() => onOpen(item)} aria-label={`查看工作项 ${item.workItemCode} ${item.name}`}>
		<span className={styles.collabItemTitle}>
			<span className={styles.collabItemCode}>{item.workItemCode}</span>
			<span className={styles.collabItemType}>{typeLabel}</span>
			<span className={styles.collabItemName}>{item.name}</span>
		</span>
		<span className={styles.collabItemMeta}>
			<span className={`${styles.collabBadge} ${statusTone(item.status)}`}>{item.status || '-'}</span>
			<span>{item.priority || '无优先级'}</span>
			<span>{item.assignee || '未分配'}</span>
			{item.projectName ? <span>{item.projectName}</span> : null}
		</span>
	</button>;
}

/** 覆盖式详情视图：字段区 + 需求正文（Markdown）+ 关联资源 + 发送到对话。 */
function WorkItemDetailPane({ bundle, loading, onBack, onSend }: { bundle: WorkItemDetailBundle; loading: boolean; onBack: () => void; onSend: (item: RpcWorkItemDetail) => void }) {
	const { detail } = bundle;
	const fields: Array<[string, string]> = [
		['状态', detail.status || '-'],
		['优先级', detail.priority || '-'],
		['负责人', detail.assignee || '未分配'],
		['创建人', detail.creatorName || '-'],
		['项目', detail.projectName || '-'],
		['迭代', detail.iterationName || '-'],
		['计划周期', detail.planStartDate || detail.planEndDate ? `${detail.planStartDate || '?'} ~ ${detail.planEndDate || '?'}` : '-'],
		['类型', detail.taskType && detail.workItemType === '任务' ? `${detail.workItemType}/${detail.taskType}` : detail.workItemType],
	];
	return <div className={styles.collabDetail}>
		<div className={styles.collabDetailToolbar}>
			<Hint content="返回列表"><Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="返回工作项列表"><ArrowLeft size={15} /></Button></Hint>
			<span className={styles.collabDetailCode}>{detail.workItemCode}</span>
			<Button type="button" variant="default" size="sm" className={styles.collabDetailSend} onClick={() => onSend(detail)} disabled={loading}>
				<Send size={13} aria-hidden="true" /><span>发送到对话</span>
			</Button>
		</div>
		<h3 className={styles.collabDetailTitle}>{detail.name}</h3>
		<dl className={styles.collabDetailFields}>{fields.map(([label, value]) => <div key={label} className={styles.collabDetailField}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
		{/* Gitee 同步需求类工作项时会把同一份规范化正文同时写入 description 与 requirementMarkdown，内容重复时只保留“需求内容”。 */}
		{detail.description?.trim() && detail.requirementMarkdown?.trim() !== detail.description.trim() ? <section className={styles.collabDetailSection}><h4>描述</h4><div className={styles.collabMarkdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.description}</ReactMarkdown></div></section> : null}
		{detail.requirementMarkdown?.trim() ? <section className={styles.collabDetailSection}><h4>需求内容</h4><div className={styles.collabMarkdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.requirementMarkdown}</ReactMarkdown></div></section> : null}
	</div>;
}

export function WorkCollaborationPanel({ refreshKey, onSendToConversation }: WorkCollaborationPanelProps) {
	const [projects, setProjects] = useState<RpcWorkProjectSummary[]>([]);
	const [projectsLoaded, setProjectsLoaded] = useState(false);
	const [projectId, setProjectId] = useState<number | null>(null);
	const [keywordInput, setKeywordInput] = useState('');
	const [keyword, setKeyword] = useState('');
	const [status, setStatus] = useState<string | null>(null);
	const [workItemType, setWorkItemType] = useState<string | null>(null);
	const [page, setPage] = useState<RpcWorkItemPage | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [detail, setDetail] = useState<WorkItemDetailBundle | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	// 请求序号防止竞态：旧请求迟到时丢弃，只渲染最后一次的结果。
	const requestSeq = useRef(0);

	/** 拉取工作项分页；过滤条件变化时 targetPage 归 1。 */
	const loadPage = useCallback(async (targetPage: number) => {
		const seq = ++requestSeq.current;
		setLoading(true);
		setError(null);
		try {
			const response = await rpc.workItemPage({ page: targetPage, size: PAGE_SIZE, status: status ?? undefined, projectId: projectId ?? undefined, keyword: keyword.trim() || undefined, workItemType: workItemType ?? undefined });
			if (seq !== requestSeq.current) return;
			if (!response.success || response.command !== 'work_item_page') throw new Error(('error' in response && response.error) || '工作项查询失败');
			setPage(response.data);
		} catch (loadError) {
			if (seq !== requestSeq.current) return;
			setError(loadError instanceof Error ? loadError.message : String(loadError));
			setPage(null);
		} finally {
			if (seq === requestSeq.current) setLoading(false);
		}
	}, [status, projectId, keyword, workItemType]);

	/** 项目下拉首次进入拉一次并缓存；翻页/过滤复用同一份。 */
	useEffect(() => {
		if (projectsLoaded) return;
		let cancelled = false;
		void rpc.workProjectList().then((response) => {
			if (cancelled) return;
			if (response.success && response.command === 'work_project_list') {
				setProjects(response.data.projects);
				setProjectsLoaded(true);
			}
		}).catch(() => { /* 项目下拉失败不阻塞列表；列表自身会报错 */ });
		return () => { cancelled = true; };
	}, [projectsLoaded]);

	// 过滤条件（项目/状态/类型/关键词）任意变化都重置回第一页。
	useEffect(() => { void loadPage(1); }, [loadPage]);

	// 模型写工作项后（refreshKey 变化）自动重拉当前页，让用户立刻看到 Agent 改了什么。
	useEffect(() => {
		if (refreshKey === 0) return;
		if (page) void loadPage(page.page);
	}, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

	const openDetail = async (item: RpcWorkItemListItem) => {
		setDetailLoading(true);
		setError(null);
		try {
			const response = await rpc.workItemDetail(item.id);
			if (!response.success || response.command !== 'work_item_detail') throw new Error(('error' in response && response.error) || '工作项详情加载失败');
			setDetail({ detail: response.data.detail });
		} catch (detailError) {
			setError(detailError instanceof Error ? detailError.message : String(detailError));
		} finally {
			setDetailLoading(false);
		}
	};

	const submitKeyword = () => { setKeyword(keywordInput); };

	if (detail) {
		return <div className={styles.collabRoot}>
			<ScrollArea className={styles.collabScroll} fitContent>
				<WorkItemDetailPane bundle={detail} loading={detailLoading} onBack={() => setDetail(null)} onSend={onSendToConversation} />
			</ScrollArea>
		</div>;
	}

	const activeProject = projects.find((project) => project.id === projectId) ?? null;
	return <div className={styles.collabRoot}>
		<div className={styles.collabToolbar}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className={styles.collabProjectTrigger} aria-label="按项目筛选">{activeProject ? activeProject.name : '全部项目'}</Button></DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onSelect={() => setProjectId(null)}>全部项目</DropdownMenuItem>
					{projects.map((project) => <DropdownMenuItem key={project.id} onSelect={() => setProjectId(project.id)}>{project.name}</DropdownMenuItem>)}
				</DropdownMenuContent>
			</DropdownMenu>
			<div className={styles.collabSearch}>
				<Search size={13} aria-hidden="true" />
				<input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitKeyword(); } }} placeholder="搜索工作项…" aria-label="搜索工作项" />
				{keywordInput ? <button type="button" className={styles.collabSearchClear} onClick={() => { setKeywordInput(''); setKeyword(''); }} aria-label="清除搜索"><X size={12} /></button> : null}
			</div>
			<Hint content="刷新当前页"><Button type="button" variant="ghost" size="icon-sm" onClick={() => { if (page) void loadPage(page.page); }} disabled={loading} aria-label="刷新工作项列表"><RefreshCw size={14} /></Button></Hint>
		</div>
		<div className={styles.collabChips} role="group" aria-label="按状态筛选">
			<button type="button" className={`${styles.collabChip} ${status == null ? styles.collabChipActive : ''}`} onClick={() => setStatus(null)}>全部</button>
			{WORK_ITEM_STATUSES.map((entry) => <button key={entry} type="button" className={`${styles.collabChip} ${status === entry ? styles.collabChipActive : ''}`} onClick={() => setStatus(status === entry ? null : entry)}>{entry}</button>)}
		</div>
		<div className={styles.collabChips} role="group" aria-label="按类型筛选">
			{WORK_ITEM_TYPES.map((entry) => <button key={entry} type="button" className={`${styles.collabChip} ${workItemType === entry ? styles.collabChipActive : ''}`} onClick={() => setWorkItemType(workItemType === entry ? null : entry)}>
				{entry === '缺陷' ? <Bug size={11} aria-hidden="true" /> : <ClipboardList size={11} aria-hidden="true" />}{entry}
			</button>)}
		</div>
		<div className={styles.collabListHeader}>
			{loading ? <Loader2 className="animate-spin" size={13} aria-hidden="true" /> : null}
			<span>{page ? `共 ${page.total} 项 · 第 ${page.page}/${Math.max(page.totalPages, 1)} 页` : '加载中…'}</span>
		</div>
		{error ? <div className={styles.collabError} role="alert">{error}</div> : null}
		<ScrollArea className={styles.collabScroll} fitContent>
			{page && page.records.length > 0 ? <div className={styles.collabList} role="list">
				{page.records.map((item) => <WorkItemRow key={item.id} item={item} onOpen={(target) => void openDetail(target)} />)}
			</div> : !loading && !error ? <div className={styles.collabEmpty}><Network size={20} aria-hidden="true" /><span>没有匹配的工作项</span><small>调整项目、状态或关键词后再试。</small></div> : null}
			{page && page.totalPages > 1 ? <div className={styles.collabPagination}>
				<Hint content="上一页"><Button type="button" variant="outline" size="icon-sm" onClick={() => void loadPage(Math.max(page.page - 1, 1))} disabled={loading || page.page <= 1} aria-label="上一页"><ChevronLeft size={14} /></Button></Hint>
				<span>{page.page} / {page.totalPages}</span>
				<Hint content="下一页"><Button type="button" variant="outline" size="icon-sm" onClick={() => void loadPage(Math.min(page.page + 1, page.totalPages))} disabled={loading || page.page >= page.totalPages} aria-label="下一页"><ChevronRight size={14} /></Button></Hint>
			</div> : null}
		</ScrollArea>
	</div>;
}
