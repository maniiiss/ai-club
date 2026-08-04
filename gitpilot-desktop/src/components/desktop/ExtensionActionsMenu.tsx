/**
 * 标题栏右上角扩展操作入口。
 *
 * 默认隐藏，鼠标上移到标题栏右侧区域时显示（CSS 由 TargetTitleBar.module.css 控制）。
 * 点击后向下展开两个图标（需求列表、RTK 设置），图标 hover 显示 tooltip，
 * 点击执行二次操作（打开选择器/设置 Dialog），不向对话发送任何命令文本。
 */
import { useState } from 'react';
import { ClipboardList, ListChecks, Settings2, Target, Wrench } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useRtkStore } from '@/src/store/rtk';
import { useWorkbenchStore } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/src/components/ui/tooltip';
import styles from './ExtensionActionsMenu.module.css';

export function ExtensionActionsMenu() {
	const executeCommand = useSessionStore((s) => s.executeCommand);
	const setComposerPrefill = useWorkbenchStore((s) => s.setComposerPrefill);
	// 受控展开：面板展开期间保持按钮可见，避免鼠标移到弹出面板时按钮消失
	const [open, setOpen] = useState(false);

	return (
		<div className={`${styles.wrapper} ${open ? styles.visible : ''}`} data-ext-actions>
		<TooltipProvider>
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className={styles.trigger}
					title="扩展操作"
					aria-label="扩展操作"
				>
					<Settings2 size={15} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className={`${styles.panel} w-auto min-w-0 p-1`}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={styles.action}
							onClick={() => setComposerPrefill('/goal ')}
							aria-label="目标计划"
						>
							<Target size={17} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>目标计划</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={styles.action}
							onClick={() => setComposerPrefill('/plan ')}
							aria-label="计划模式"
						>
							<ListChecks size={17} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>计划模式</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={styles.action}
							onClick={() => void executeCommand('requirement')}
							aria-label="需求列表"
						>
							<ClipboardList size={17} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>需求列表</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={styles.action}
							onClick={() => useRtkStore.getState().openSettings()}
							aria-label="RTK 设置"
						>
							<Wrench size={17} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>RTK 设置</TooltipContent>
				</Tooltip>
			</PopoverContent>
		</Popover>
		</TooltipProvider>
		</div>
	);
}
