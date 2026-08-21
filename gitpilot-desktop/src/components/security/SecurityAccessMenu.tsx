/**
 * Code 会话安全入口。
 *
 * 业务意图：把当前会话的审批策略放在输入框左下角，用户无需打开设置页就能
 * 看见当前权限并快速切换；弹层只承载访问权限选择，沙箱执行模式仍由完整设置维护。
 */
import { Check, Hand, Shield, ShieldAlert, type LucideIcon } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { Hint } from '@/src/components/ui/tooltip';
import type { SessionApprovalMode } from '@/src/rpc/types';
import { useSessionStore } from '@/src/store/session';
import styles from './SecurityAccessMenu.module.css';

export const ACCESS_OPTIONS: ReadonlyArray<{
	value: SessionApprovalMode;
	label: string;
	description: string;
	Icon: LucideIcon;
}> = [
	{
		value: 'per_request',
		label: '请求批准',
		description: '编辑外部文件、使用 Bash、联网或访问工作区外内容时逐项询问。',
		Icon: Hand,
	},
	{
		value: 'full_access',
		label: '完全访问权限',
		description: '本会话内需审批的操作直接放行；危险命令仍受安全策略限制。',
		Icon: ShieldAlert,
	},
];

/** 触发按钮使用短标签，保证窄输入框中也能明确表达当前会话权限。 */
export function getSessionApprovalLabel(mode: SessionApprovalMode): string {
	return mode === 'full_access' ? '完全访问' : '请求批准';
}

export function SecurityAccessMenu() {
	const sandbox = useSessionStore((state) => state.sandboxStatus);
	const approvalMode = useSessionStore((state) => state.sessionApprovalMode);
	const setSessionApprovalMode = useSessionStore((state) => state.setSessionApprovalMode);

	const currentMode = sandbox?.mode ?? 'windows-native';
	const currentApprovalLabel = getSessionApprovalLabel(approvalMode);
	const positionLabel = `${currentMode === 'gondolin' ? '增强隔离' : '原生防护'} · ${currentApprovalLabel}`;

	const changeMode = async (mode: SessionApprovalMode) => {
		if (mode === approvalMode) return;
		if (mode === 'full_access' && typeof window !== 'undefined' && !window.confirm('切换为完全访问权限后，本会话内文件修改、Bash、网络等需审批工具将直接放行，不再逐个弹卡确认。确认切换？')) return;
		await setSessionApprovalMode(mode);
	};

	return (
		<Popover>
			<Hint content={`安全与审批：${positionLabel}`}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={`${styles.trigger} ${approvalMode === 'full_access' ? styles.triggerFullAccess : ''}`}
						aria-label={`审批权限：${currentApprovalLabel}`}
					>
						<Shield size={15} aria-hidden="true" />
						<span>{currentApprovalLabel}</span>
					</Button>
				</PopoverTrigger>
			</Hint>
			<PopoverContent className={styles.popover} align="start" sideOffset={8}>
				<div className={styles.panel}>
					<div className={styles.header}>
						<strong className={styles.title}>应如何批准 GitPilot 操作？</strong>
						<span className={styles.headerIcon} aria-hidden="true"><Shield size={14} /></span>
					</div>
					<div className={styles.modeList} role="radiogroup" aria-label="访问权限">
						{ACCESS_OPTIONS.map(({ value, label, description, Icon }) => {
							const active = approvalMode === value;
							return (
								<button
									key={value}
									type="button"
									role="radio"
									aria-checked={active}
									className={`${styles.modeOption} ${active ? styles.modeOptionActive : ''} ${value === 'full_access' ? styles.modeOptionFullAccess : ''}`}
									onClick={() => void changeMode(value)}
								>
									<span className={styles.optionIcon} aria-hidden="true"><Icon size={17} /></span>
									<span className={styles.optionCopy}>
										<strong>{label}</strong>
										<span>{description}</span>
									</span>
									{active && <Check size={16} className={styles.check} aria-hidden="true" />}
								</button>
							);
						})}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
