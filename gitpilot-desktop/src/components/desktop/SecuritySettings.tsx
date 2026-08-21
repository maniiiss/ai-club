/**
 * 安全与沙箱设置面板。
 *
 * 业务意图：展示当前安全执行状态。当前构建仅支持 Windows 原生防护，
 * 增强隔离（WSL2 + Gondolin）尚未接入，故不暴露切换入口，默认即为 Windows 原生防护。
 */
import { useState } from 'react';
import { ArrowClockwise as RefreshCw } from '@phosphor-icons/react';
import { Button } from '@/src/components/ui/button';
import { useSessionStore } from '@/src/store/session';
import styles from './SettingsDialog.module.css';

/** 安全设置面板：当前构建仅提供 Windows 原生防护，默认即为该模式，不暴露切换入口。 */
export function SecuritySettings() {
	const sandbox = useSessionStore((state) => state.sandboxStatus);
	const refreshAll = useSessionStore((state) => state.refreshAll);
	const [busy, setBusy] = useState(false);
	return (
		<section className={styles.section} aria-label="安全与沙箱">
			<div className={styles.sectionHeading}><h3>安全与沙箱</h3></div>
			<div className={styles.fieldGrid}>
				<div className={styles.field}><label>执行模式</label><div className={styles.directoryValue}>Windows 原生防护</div></div>
				<div className={styles.field}><label>当前状态</label><div className={styles.directoryValue}>{sandbox?.initialized ? '已初始化' : sandbox?.message ?? '检测中'}</div></div>
			</div>
			<div className="mt-3">
				<Button type="button" variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await refreshAll(); } finally { setBusy(false); } }}>
					<RefreshCw />重新检测
				</Button>
			</div>
		</section>
	);
}
