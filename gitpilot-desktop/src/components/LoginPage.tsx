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
		<div className="flex h-full items-center justify-center bg-[var(--color-bg)]">
			<div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-7 shadow-lg">
				<div className="mb-5 flex items-center gap-2.5">
					<div className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]">
						<LogIn size={18} />
					</div>
					<div>
						<h1 className="text-base font-medium text-[var(--color-text)]">登录 AI Club 平台</h1>
						<p className="text-xs text-[var(--color-text-muted)]">设备授权登录 GitPilot</p>
					</div>
				</div>

				{phase !== 'polling' && phase !== 'done' && (
					<>
						<label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">平台地址</label>
						<input
							value={platformUrl}
							onChange={(e) => setPlatformUrl(e.target.value)}
							disabled={busy}
							placeholder="https://gitpilot.example.com"
							className="mb-4 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
						/>
						<button
							type="button"
							onClick={start}
							disabled={busy || !platformUrl.trim()}
							className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] py-2 text-sm text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
							{phase === 'requesting' ? '正在请求设备授权…' : '登录平台'}
						</button>
					</>
				)}

				{phase === 'polling' && auth && (
					<div className="py-2">
						<p className="mb-3 text-sm text-[var(--color-text-secondary)]">已在浏览器打开授权页，请在浏览器中完成授权：</p>
						<div className="mb-4 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-4 text-center">
							<div className="text-xs text-[var(--color-text-muted)]">验证码</div>
							<div className="mono mt-1 text-2xl font-semibold tracking-widest text-[var(--color-primary-hover)]">{auth.userCode}</div>
						</div>
						<div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
							<Loader2 size={13} className="animate-spin" />
							等待授权完成…
						</div>
						<a
							href={auth.verificationUri}
							target="_blank"
							rel="noreferrer"
							className="mt-3 flex items-center justify-center gap-1 text-xs text-[var(--color-primary-hover)] hover:underline"
						>
							<ExternalLink size={12} /> 重新打开授权页
						</a>
					</div>
				)}

				{phase === 'done' && (
					<div className="flex items-center justify-center gap-2 py-4 text-sm text-[var(--color-success)]">
						<Loader2 size={15} className="animate-spin" /> 登录成功，正在进入…
					</div>
				)}

				{displayError && (
					<div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--color-error)]/40 bg-[var(--color-code-diff-del)] p-2.5 text-xs text-[var(--color-error)]">
						<AlertCircle size={13} className="mt-0.5 shrink-0" />
						<span>{displayError}</span>
					</div>
				)}
			</div>
		</div>
	);
}
