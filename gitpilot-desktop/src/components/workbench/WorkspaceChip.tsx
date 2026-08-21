/** 工作空间选择 chip：欢迎页输入框下方的当前工作空间入口，数据源由父级注入以复用 Code/Work 两种模式。 */
import { CaretDown as ChevronDown, Check, Folder, FolderOpen, Plus } from '@phosphor-icons/react';
import { Button } from '@/src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import styles from './WorkspaceChip.module.css';

export interface WorkspaceChipItem {
	name: string;
	path: string;
}

interface WorkspaceChipProps {
	items: WorkspaceChipItem[];
	currentPath: string | null;
	onSelect: (path: string) => void;
	onAdd: () => void;
}

export function WorkspaceChip({ items, currentPath, onSelect, onAdd }: WorkspaceChipProps) {
	const current = items.find((item) => item.path === currentPath) ?? null;
	const label = current?.name ?? currentPath?.split(/[\\/]/).filter(Boolean).pop() ?? '选择工作空间';
	return <DropdownMenu>
		<DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={styles.chip} aria-label={`当前工作空间：${label}，切换工作空间`}><Folder size={13} aria-hidden="true" /><span className={styles.chipLabel}>{label}</span><ChevronDown size={12} aria-hidden="true" /></Button></DropdownMenuTrigger>
		<DropdownMenuContent align="center" className={styles.menu}>
			{items.length === 0 ? <DropdownMenuItem disabled>暂无工作空间</DropdownMenuItem> : items.map((item) => <DropdownMenuItem key={item.path} onSelect={() => onSelect(item.path)}><FolderOpen size={14} aria-hidden="true" /><span className={styles.itemCopy}><strong>{item.name}</strong><small>{item.path}</small></span>{item.path === currentPath && <Check size={13} aria-label="当前工作空间" />}</DropdownMenuItem>)}
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={onAdd}><Plus size={14} aria-hidden="true" />添加工作空间</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}
