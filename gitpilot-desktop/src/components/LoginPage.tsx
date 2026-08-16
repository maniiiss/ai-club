/**
 * 登录页：图形化设备授权。
 *
 * 流程：使用部署配置中的平台地址 -> 调 Rust cli_login_start 拿设备码 ->
 * 显示验证码 + 轮询 cli_login_poll -> 拿到 token 后通过 RPC set_token 注入 sidecar ->
 * refreshAll 重新拉取状态（登录态变 true，App 切到主界面）。
 *
 * 对应设计文档第 8 节平台集成；与 CLI 的 /login 走同一套 /api/cli/device/* API，
 * 但触发与 UI 在桌面版侧，规避 RPC 模式不支持 /login 的问题。
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, BriefcaseBusiness, Code2, ExternalLink, Loader2, LogIn, Palette } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { rpc, isTauriEnv } from '@/src/rpc/bridge';
import { DEPLOYMENT } from '@/src/lib/config';
import { startDraggingWindow } from '@/src/desktop/window';
import { Button } from '@/src/components/ui/button';
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

	// 平台地址由部署配置统一管理，登录页只呈现授权动作，不暴露环境地址。
	const platformUrl = DEPLOYMENT.apiBaseUrl;
	const [phase, setPhase] = useState<'idle' | 'requesting' | 'polling' | 'done'>('idle');
	const [auth, setAuth] = useState<DeviceAuth | null>(null);
	const [localError, setLocalError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startDragging = (event: MouseEvent<HTMLDivElement>) => {
		if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button, a, input, textarea, [role="button"]'))) return;
		void startDraggingWindow();
	};
	const normalizeLoginError = (error: unknown): string => {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('error sending request') || message.includes('请求失败')) return '无法连接登录服务，请检查网络或平台服务是否启动。';
		if (message.includes('打开 GitPilot Web')) return '无法打开授权页面，请检查系统默认浏览器。';
		return message.replaceAll(DEPLOYMENT.apiBaseUrl, '平台服务').replaceAll(DEPLOYMENT.webBaseUrl, '平台服务');
	};
	const requestDeviceAuthorization = async (): Promise<{ auth: DeviceAuth; platformUrl: string }> => {
		let lastError: unknown = null;
		// 源码模式下公众端 Vite 没有 /api 代理，先直连后端；Web 地址只作为旧部署的回退。
		for (const candidate of [...new Set([DEPLOYMENT.apiBaseUrl, DEPLOYMENT.webBaseUrl].filter(Boolean))]) {
			try {
				const auth = await invoke<DeviceAuth>('cli_login_start', { platformUrl: candidate });
				return { auth, platformUrl: candidate };
			} catch (error) {
				lastError = error;
			}
		}
		throw lastError ?? new Error('无法连接登录服务');
	};

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
			const authorization = await requestDeviceAuthorization();
			const { auth: res, platformUrl: requestPlatformUrl } = authorization;
			setAuth(res);
			// 浏览器打开由前端显式触发，失败时把原生层错误反馈给用户，而不是静默进入轮询。
			await invoke('open_platform_web', { platformUrl: res.verificationUri });
			setPhase('polling');
			poll(res.deviceCode, res.intervalSeconds, requestPlatformUrl);
		} catch (e) {
			setLocalError(normalizeLoginError(e));
			setPhase('idle');
		}
	};

	const poll = (deviceCode: string, interval: number, requestPlatformUrl: string) => {
		const tick = async () => {
			try {
				const res = await invoke<PollResult>('cli_login_poll', { platformUrl: requestPlatformUrl, deviceCode });
				if (res.status === 'success' && res.token) {
					await rpc.setToken(requestPlatformUrl, res.token);
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
				setLocalError(normalizeLoginError(e));
				setPhase('idle');
			}
		};
		pollRef.current = setTimeout(tick, Math.max(interval, 2) * 1000);
	};

	const busy = phase === 'requesting' || phase === 'polling';
	const displayError = localError || error;

	return (
		<div className={styles.page} onMouseDown={startDragging}>
			<div className={styles.ambientGlow} aria-hidden="true" />
			<div className={styles.grid} aria-hidden="true" />
			<main className={styles.layout}>
				<section className={styles.intro}>
					<div className={styles.brandLockup}><span className={styles.brandPulse} /><span>GitPilot Desktop</span></div>
				</section>

				<section className={styles.card} aria-labelledby="login-title">
					<div className={styles.brandRow}>
						<div className={styles.logo}><LogIn size={18} /></div>
						<h1 id="login-title" className={styles.title}>GitPilot</h1>
					</div>

				{phase !== 'polling' && phase !== 'done' && (
					<>
						<Button
							type="button"
							variant="default"
							size="default"
							onClick={start}
							disabled={busy || !platformUrl.trim()}
							className={styles.submit}
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
							{phase === 'requesting' ? '正在准备授权…' : '登录'}
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
					<div className={styles.modes} aria-label="工作模式"><div><Code2 size={15} /><span>Code</span><small>编写与执行</small></div><div><Palette size={15} /><span>Design</span><small>设计与预览</small></div><div><BriefcaseBusiness size={15} /><span>Work</span><small>任务与协作</small></div></div>
				</section>
			</main>
			<footer className={styles.copyright}>© 2026 GitPilot · 保留所有权利。</footer>
		</div>
	);
}
