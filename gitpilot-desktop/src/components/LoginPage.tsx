/**
 * 登录页：图形化设备授权。
 *
 * 流程：输入平台地址 -> 调 Rust cli_login_start 拿设备码并自动打开浏览器 ->
 * 显示验证码 + 轮询 cli_login_poll -> 拿到 token 后通过 RPC set_token 注入 sidecar ->
 * refreshAll 重新拉取状态（登录态变 true，App 切到主界面）。
 *
 * 对应设计文档第 8 节平台集成；与 CLI 的 /login 走同一套 /api/cli/device/* API，
 * 但触发与 UI 在桌面版侧，规避 RPC 模式不支持 /login 的问题。
 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, ExternalLink, LogIn, AlertCircle } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { rpc, isTauriEnv } from '@/src/rpc/bridge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import styles from './LoginPage.module.css';

interface DeviceAuth {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	expiresInSeconds: number;
	intervalSeconds: number;
}

interface PollResult {
	status: 'success' | 'pending' | 'slow_down' | 'expired' | 'error';
	token?: string;
	user?: { id: number; username: string; nickname?: string };
	message?: string;
}

export function LoginPage() {
	const refreshAll = useSessionStore((s) => s.refreshAll);
	const markLoggedIn = useSessionStore((s) => s.markLoggedIn);
	const clearError = useSessionStore((s) => s.clearError);
	const error = useSessionStore((s) => s.error);

	const [platformUrl, setPlatformUrl] = useState('http://localhost:8080');
	const [phase, setPhase] = useState<'idle' | 'requesting' | 'polling' | 'done'>('idle');
	const [auth, setAuth] = useState<DeviceAuth | null>(null);
	const [localError, setLocalError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (pollRef.current) clearTimeout(pollRef.current);
		};
	}, []);

	const start = async () => {
		setLocalError(null);
		clearError();
		if (!isTauriEnv()) {
			setLocalError('mock 模式不支持登录，请在 Tauri 桌面应用中运行');
			return;
		}
		setPhase('requesting');
		try {
			const res = await invoke<DeviceAuth>('cli_login_start', { platformUrl });
			setAuth(res);
			setPhase('polling');
			poll(res.deviceCode, res.intervalSeconds);
		} catch (e) {
			setLocalError(e instanceof Error ? e.message : String(e));
			setPhase('idle');
		}
	};

	const poll = (deviceCode: string, interval: number) => {
		const tick = async () => {
			try {
				const res = await invoke<PollResult>('cli_login_poll', { platformUrl, deviceCode });
				if (res.status === 'success' && res.token) {
					await rpc.setToken(platformUrl, res.token);
					// token 已注入 sidecar，立即标记已登录（与模型列表可用性解耦，避免平台暂无模型时卡回登录页）
					markLoggedIn();
					setPhase('done');
					await refreshAll();
					return;
				}
				if (res.status === 'expired' || res.status === 'error') {
					setLocalError(res.message || '登录失败，请重试');
					setPhase('idle');
					return;
				}
				// pending / slow_down：继续轮询
				pollRef.current = setTimeout(tick, Math.max(interval, 2) * 1000);
			} catch (e) {
				setLocalError(e instanceof Error ? e.message : String(e));
				setPhase('idle');
			}
		};
		pollRef.current = setTimeout(tick, Math.max(interval, 2) * 1000);
	};

	const busy = phase === 'requesting' || phase === 'polling';
	const displayError = localError || error;

	return (
		<div className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brandRow}>
						<div className={styles.logo}>
						<LogIn size={18} />
					</div>
					<div>
						<h1 className={styles.title}>登录 AI Club 平台</h1>
						<p className={styles.subtitle}>设备授权登录 GitPilot</p>
					</div>
				</div>

				{phase !== 'polling' && phase !== 'done' && (
					<>
						<label className={styles.label} htmlFor="platform-url">平台地址</label>
						<Input
							id="platform-url"
							value={platformUrl}
							onChange={(e) => setPlatformUrl(e.target.value)}
							disabled={busy}
							placeholder="https://gitpilot.example.com"
							className={styles.input}
						/>
						<Button
							type="button"
							variant="default"
							size="default"
							onClick={start}
							disabled={busy || !platformUrl.trim()}
							className={styles.submit}
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
							{phase === 'requesting' ? '正在请求设备授权…' : '登录平台'}
						</Button>
					</>
				)}

				{phase === 'polling' && auth && (
					<div className={styles.polling}>
						<p className={styles.pollingDescription}>已在浏览器打开授权页，请在浏览器中完成授权：</p>
						<div className={styles.codeBox}>
							<div className={styles.codeLabel}>验证码</div>
							<div className={styles.code}>{auth.userCode}</div>
						</div>
						<div className={styles.waiting}>
							<Loader2 size={13} className="animate-spin" />
							等待授权完成…
						</div>
						<Button
							type="button"
							variant="link"
							size="sm"
							onClick={() => void invoke('open_platform_web', { platformUrl: auth.verificationUri })}
							className={styles.reopen}
						>
							<ExternalLink size={12} /> 重新打开授权页
						</Button>
					</div>
				)}

				{phase === 'done' && (
					<div className={styles.done}>
						<Loader2 size={15} className="animate-spin" /> 登录成功，正在进入…
					</div>
				)}

				{displayError && (
					<div className={styles.error}>
						<AlertCircle size={13} className={styles.errorIcon} />
						<span>{displayError}</span>
					</div>
				)}
			</div>
		</div>
	);
}
