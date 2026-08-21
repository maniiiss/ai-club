/**
 * Code 模式安全审批卡片。
 *
 * 业务意图：把文件修改、Bash、工作区外访问和网络风险明确展示给用户，
 * 三种决策直接对应 sidecar 的审批协议，不复用 Design 的审批状态。
 */
import { Check, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useActiveSecurityApproval, useSessionStore } from '@/src/store/session';
import styles from './SecurityApprovalCard.module.css';

const riskLabels: Record<string, string> = {
	write: '文件修改',
	command: '命令执行',
	outside_workspace: '工作区外访问',
	network: '网络访问',
	dangerous: '高风险命令',
};

export function SecurityApprovalCard() {
	const approval = useActiveSecurityApproval();
	const respond = useSessionStore((state) => state.respondSecurityApproval);
	if (!approval) return null;
	return (
		<section className={styles.card} role="alert" aria-label="安全审批">
			<div className={styles.heading}><ShieldAlert size={16} /><strong>{approval.title}</strong><span>{riskLabels[approval.risk] ?? approval.risk}</span></div>
			<p>{approval.summary}</p>
			{approval.command && <pre className={styles.command}>{approval.command}</pre>}
			<div className={styles.details}>
				<span>工作目录：{approval.cwd}</span>
				{approval.paths?.map((path) => <span key={path}>目标：{path}</span>)}
			</div>
			<div className={styles.actions}>
				<Button size="sm" onClick={() => void respond(approval, 'approve_once')}><Check size={13} />允许一次</Button>
				<Button size="sm" variant="secondary" onClick={() => void respond(approval, 'approve_session')}><Check size={13} />本会话允许</Button>
				<Button size="sm" variant="ghost" onClick={() => void respond(approval, 'deny')}><X size={13} />拒绝</Button>
			</div>
		</section>
	);
}

