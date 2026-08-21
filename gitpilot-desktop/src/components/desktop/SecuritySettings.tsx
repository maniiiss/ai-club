/**
 * 安全与沙箱设置面板。
 *
 * 业务意图：把“执行模式切换 + 沙箱状态 + 能力检测”抽成共享组件，供设置弹窗
 * 与对话界面安全入口复用，避免两套 UI 各自维护一套不一致的逻辑。
 */
import { useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { rpc } from '@/src/rpc/bridge';
import { useSessionStore } from '@/src/store/session';
import { loadSecurityPreferences, saveSecurityPreferences } from '@/src/store/settings';
import styles from './SettingsDialog.module.css';

/** 安全设置面板：切换执行模式只对新任务生效，Gondolin 不可用时保留安装引导状态。 */
export function SecuritySettings() {
	const policy = useSessionStore((state) => state.securityPolicy);
	const sandbox = useSessionStore((state) => state.sandboxStatus);
	const refreshAll = useSessionStore((state) => state.refreshAll);
	const isStreaming = useSessionStore((state) => state.isStreaming);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const currentMode = policy?.sandboxMode ?? 'windows-native';
	const changeMode = async (mode: 'windows-native' | 'gondolin') => {
		if (mode === currentMode || (typeof window !== 'undefined' && !window.confirm(`切换到${mode === 'gondolin' ? '增强隔离' : 'Windows 原生防护'}？只会影响新任务。`))) return;
		setBusy(true);
		setError('');
		try {
			const response = await rpc.setSecurityPolicy({ sandboxMode: mode });
			if (!response.success) throw new Error(response.error);
			await refreshAll();
			saveSecurityPreferences({ ...loadSecurityPreferences(), sandboxMode: mode });
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};
	const capabilityText = sandbox?.mode === 'gondolin' ? `WSL2 ${sandbox.wsl2Installed ? '已安装' : '缺失'} · 虚拟化 ${sandbox.virtualizationReady ? '就绪' : '未就绪'} · Linux ${sandbox.distributionInstalled ? '已安装' : '缺失'} · Node ${sandbox.nodeInstalled ? '已安装' : '缺失'} · worker ${sandbox.gondolinWorkerInstalled ? '已安装' : '缺失'}` : '';
	return <section className={styles.section} aria-label="安全与沙箱"><div className={styles.sectionHeading}><h3>安全与沙箱</h3></div><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="sandbox-mode">执行模式</label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" id="sandbox-mode" variant="unstyled" size="sm" className={styles.selectTrigger} disabled={busy || isStreaming}><span>{currentMode === 'gondolin' ? '增强隔离（WSL2 + Gondolin）' : 'Windows 原生防护'}</span><ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className={styles.selectMenu}><DropdownMenuItem onSelect={() => void changeMode('windows-native')}>Windows 原生防护</DropdownMenuItem><DropdownMenuItem onSelect={() => void changeMode('gondolin')}>增强隔离（WSL2 + Gondolin）</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className={styles.field}><label>当前状态</label><div className={styles.directoryValue}>{sandbox?.initialized ? '已初始化' : sandbox?.message ?? '检测中'}</div></div></div>{capabilityText && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{capabilityText}</p>}{currentMode === 'gondolin' && !sandbox?.available && <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">请安装 WSL2、Linux 发行版和 GitPilot Gondolin worker 后重新检测；不会后台自动安装，也不会降级为无限制本机执行。</p>}{error && <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">{error}</p>}<div className="mt-3"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void refreshAll()}><RefreshCw />重新检测</Button></div></section>;
}