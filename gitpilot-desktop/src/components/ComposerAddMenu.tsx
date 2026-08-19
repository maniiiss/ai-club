/**
 * 输入框右侧加号菜单。
 *
 * 业务意图：把“附加文件”和“查询我负责的工作项”放进同一个轻量入口，
 * 用户不需要记住 /requirement，也不会在选择工作项时立即触发有副作用的执行。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bug, ChevronDown, ClipboardList, FilePlus2, Loader2, Paperclip, RefreshCw, X } from 'lucide-react';
import { rpc } from '@/src/rpc/bridge';
import type { PreparedAttachment, RpcWorkItemSummary } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './ComposerAddMenu.module.css';

export type ComposerAddTab = 'attachments' | 'work-items';
type WorkItemGroup = 'requirements' | 'defects';

export interface ComposerAddMenuProps {
	open: boolean;
	tab: ComposerAddTab;
	onTabChange: (tab: ComposerAddTab) => void;
	onPickFiles: () => void;
	onSelectWorkItem: (item: RpcWorkItemSummary) => void;
	onDismiss: () => void;
}

/** 工作项只按用户提出的两类阅读路径分组：需求和普通任务归为“需求任务”，缺陷单独呈现。 */
export function getWorkItemGroup(item: Pick<RpcWorkItemSummary, 'workItemType'>): WorkItemGroup {
	return (item.workItemType ?? '').trim() === '缺陷' ? 'defects' : 'requirements';
}

/** 选中工作项后输入框只保留可编辑的固定指令，工作项详情通过上下文附件隐式发送。 */
export function buildWorkItemPrompt(item: RpcWorkItemSummary): string {
	return (item.workItemType ?? '').trim() === '缺陷'
		? '帮我分析缺陷，并提出修改方案。'
		: '帮我分析需求，并设计实现方案。';
}

/** 工作项的完整内容只放进发送载荷，不直接铺开到输入框，避免上下文挤占编辑空间。 */
export function buildWorkItemContext(item: RpcWorkItemSummary): string {
	const type = item.taskType && item.workItemType === '任务' ? `${item.workItemType}/${item.taskType}` : item.workItemType;
	const lines = [
		`编号：${item.workItemCode}`,
		`名称：${item.name}`,
		`- 类型：${type || '工作项'}`,
		`- 状态：${item.status || '-'}`,
		`- 优先级：${item.priority || '-'}`,
	];
	if (item.projectName) lines.push(`- 项目：${item.projectName}`);
	if (item.iterationName) lines.push(`- 迭代：${item.iterationName}`);
	if (item.planStartDate || item.planEndDate) lines.push(`- 计划周期：${item.planStartDate || '?'} ~ ${item.planEndDate || '?'}`);
	if (item.requirementMarkdown?.trim() && item.workItemType === '需求') {
		lines.push('', '## 需求内容', item.requirementMarkdown.trim());
	}
	return lines.join('\n');
}

/** 将平台工作项转换成与普通附件一致的上下文标签，工作项同一时刻只保留一个。 */
export function createWorkItemAttachment(item: RpcWorkItemSummary): PreparedAttachment {
	return {
		name: item.name,
		kind: 'work-item',
		mimeType: 'application/vnd.gitpilot.work-item',
		sizeBytes: 0,
		text: buildWorkItemContext(item),
		workItem: item,
	};
}

/** 找到会裁剪弹层的工作台容器，欢迎页和消息页分别以各自的中心区作为顶部边界。 */
function findClippingBoundary(element: HTMLElement): HTMLElement | null {
	let parent = element.parentElement;
	while (parent) {
		const computed = window.getComputedStyle(parent);
		if ([computed.overflow, computed.overflowX, computed.overflowY].some((value) => /auto|clip|hidden|scroll/.test(value))) return parent;
		parent = parent.parentElement;
	}
	return null;
}

function WorkItemSection({
	group,
	items,
	expanded,
	onToggle,
	onSelect,
}: {
	group: WorkItemGroup;
	items: RpcWorkItemSummary[];
	expanded: boolean;
	onToggle: () => void;
	onSelect: (item: RpcWorkItemSummary) => void;
}) {
	const isDefect = group === 'defects';
	const title = isDefect ? '缺陷' : '需求任务';
	const Icon = isDefect ? Bug : ClipboardList;
	return (
		<section className={styles.section}>
			<button type="button" className={styles.sectionHeader} onClick={onToggle} aria-expanded={expanded}>
				<span className={styles.sectionTitle}><Icon size={14} aria-hidden="true" /><strong>{title}</strong><span className={styles.count}>{items.length}</span></span>
				<ChevronDown size={15} className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} aria-hidden="true" />
			</button>
			{expanded && <div className={styles.itemList}>
				{items.length === 0 ? <p className={styles.sectionEmpty}>暂无{title}</p> : items.map((item) => (
					<button type="button" key={item.id} className={styles.item} onClick={() => onSelect(item)} title="带入当前输入框">
						<span className={`${styles.itemBadge} ${isDefect ? styles.itemBadgeDefect : ''}`}>{item.workItemType === '任务' ? '任务' : item.workItemType || '工作项'}</span>
						<span className={styles.itemMain}>
							<strong className={styles.itemName}>{item.name}</strong>
							<span className={styles.itemMeta}><span>{item.workItemCode}</span>{item.projectName && <span>{item.projectName}</span>}<span>{item.status || '未设置状态'}</span></span>
						</span>
						<span className={styles.itemPriority}>{item.priority || '-'}</span>
					</button>
				))}
			</div>}
		</section>
	);
}

export function ComposerAddMenu({ open, tab, onTabChange, onPickFiles, onSelectWorkItem, onDismiss }: ComposerAddMenuProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const [items, setItems] = useState<RpcWorkItemSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<WorkItemGroup, boolean>>({ requirements: true, defects: true });

	const loadItems = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await rpc.getPlatformWorkItems();
			if (!response.success || response.command !== 'get_platform_work_items') throw new Error(response.success ? '工作项响应格式异常' : response.error);
			setItems(response.data.items);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open || tab !== 'work-items') return;
		void loadItems();
	}, [loadItems, open, tab]);

	/**
	 * 弹层底部仍贴着输入框，但顶部不能越过当前工作台；超出的工作项内容留在弹层内部滚动。
	 * 用布局测量而不是固定视口高度，保证欢迎页居中、窗口缩放和底部面板变化时都能正确留出空间。
	 */
	useLayoutEffect(() => {
		if (!open) return;
		const panel = panelRef.current;
		const anchor = panel?.parentElement;
		if (!panel || !anchor) return;
		const boundary = findClippingBoundary(anchor);
		const updateMaxHeight = () => {
			const anchorTop = anchor.getBoundingClientRect().top;
			const boundaryTop = boundary?.getBoundingClientRect().top ?? 0;
			const safeTop = Math.max(8, boundaryTop + 8);
			const availableHeight = Math.max(0, Math.floor(anchorTop - 10 - safeTop));
			panel.style.setProperty('--composer-add-menu-max-height', `${availableHeight}px`);
		};

		updateMaxHeight();
		window.addEventListener('resize', updateMaxHeight);
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMaxHeight);
		observer?.observe(anchor);
		if (boundary) observer?.observe(boundary);
		return () => {
			window.removeEventListener('resize', updateMaxHeight);
			observer?.disconnect();
			panel.style.removeProperty('--composer-add-menu-max-height');
		};
	}, [open, tab]);

	// 点击菜单外关闭；保留加号触发器自身的 click，让“打开/关闭”不会被 pointerdown 抢先抵消。
	useEffect(() => {
		if (!open) return;
		const dismissOutside = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (panelRef.current?.contains(target) || target?.closest('[data-add-menu-trigger="true"]')) return;
			onDismiss();
		};
		document.addEventListener('pointerdown', dismissOutside);
		return () => document.removeEventListener('pointerdown', dismissOutside);
	}, [onDismiss, open]);

	const grouped = useMemo(() => ({
		requirements: items.filter((item) => getWorkItemGroup(item) === 'requirements'),
		defects: items.filter((item) => getWorkItemGroup(item) === 'defects'),
	}), [items]);

	if (!open) return null;

	return (
		<div ref={panelRef} className={styles.panel} role="dialog" aria-label="添加上下文">
			<div className={styles.panelHeader}>
				<div><strong>添加上下文</strong></div>
				<Hint content="关闭"><Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="关闭添加上下文"><X size={15} /></Button></Hint>
			</div>
			<div className={styles.tabs} role="tablist" aria-label="添加类型">
				<button type="button" role="tab" aria-selected={tab === 'attachments'} className={tab === 'attachments' ? styles.tabActive : styles.tab} onClick={() => onTabChange('attachments')}><Paperclip size={14} />附件</button>
				<button type="button" role="tab" aria-selected={tab === 'work-items'} className={tab === 'work-items' ? styles.tabActive : styles.tab} onClick={() => onTabChange('work-items')}><ClipboardList size={14} />工作项</button>
			</div>
			{tab === 'attachments' ? (
				<div className={styles.attachmentBody}>
					<FilePlus2 size={22} aria-hidden="true" />
					<strong>附加本地文件</strong>
					<span>支持文档、图片和代码文件，作为当前对话上下文。</span>
					<Button type="button" size="sm" onClick={onPickFiles}><Paperclip size={14} />选择文件</Button>
				</div>
			) : (
				<div className={styles.workItemBody}>
					<div className={styles.workItemToolbar}><span>我负责的工作项</span><Hint content="刷新工作项"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void loadItems()} disabled={loading} aria-label="刷新工作项"><RefreshCw size={14} className={loading ? styles.spin : ''} /></Button></Hint></div>
					{loading && <div className={styles.state}><Loader2 size={18} className={styles.spin} /><span>正在读取平台工作项…</span></div>}
					{!loading && error && <div className={styles.state}><span>{error}</span><Button type="button" variant="outline" size="sm" onClick={() => void loadItems()}>重试</Button></div>}
					{!loading && !error && items.length === 0 && <div className={styles.state}><ClipboardList size={20} /><span>暂无分配给你的工作项</span><small>平台中的负责人字段匹配当前登录账号后会显示在这里。</small></div>}
					{!loading && !error && items.length > 0 && <div className={styles.sections}>
						<WorkItemSection group="requirements" items={grouped.requirements} expanded={expanded.requirements} onToggle={() => setExpanded((current) => ({ ...current, requirements: !current.requirements }))} onSelect={onSelectWorkItem} />
						<WorkItemSection group="defects" items={grouped.defects} expanded={expanded.defects} onToggle={() => setExpanded((current) => ({ ...current, defects: !current.defects }))} onSelect={onSelectWorkItem} />
					</div>}
					{!loading && !error && items.length > 0 && <p className={styles.hint}>点击工作项后会带入输入框，确认内容后再发送。</p>}
				</div>
			)}
		</div>
	);
}
