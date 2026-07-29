/**
 * 应用根组件。
 *
 * 职责：
 * - 在挂载时初始化 Tauri IPC 桥接（connect）
 * - 根据连接态渲染加载 / 主界面 / 断连重试
 * - 布局：顶栏（标题 + 用户头像）+ 项目/任务侧栏 + 对话区 + 扩展 UI 模态 + 错误提示
 */
import { useEffect } from 'react';
import { CircleUserRound, Loader2, WifiOff, RefreshCw, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { isTauriEnv } from '@/src/rpc/bridge';
import { SessionSidebar } from '@/src/components/SessionSidebar';
import { ChatView } from '@/src/components/ChatView';
import { InputBox } from '@/src/components/InputBox';
import { ExtensionUIModal } from '@/src/components/ExtensionUIModal';
import { LoginPage } from '@/src/components/LoginPage';

export default function App() {
	const connection = useSessionStore((s) => s.connection);
	const loggedIn = useSessionStore((s) => s.loggedIn);
	const error = useSessionStore((s) => s.error);
	const clearError = useSessionStore((s) => s.clearError);
	const connect = useSessionStore((s) => s.connect);
	const disconnect = useSessionStore((s) => s.disconnect);

	useEffect(() => {
		void connect();
		return () => {
			void disconnect();
		};
	}, [connect, disconnect]);

	// 连接中：加载态
	if (connection === 'connecting' || connection === 'idle') {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
				<Loader2 size={22} className="animate-spin" />
				<span className="text-sm">正在连接本地 Coding Agent…</span>
			</div>
		);
	}

	// 断连：重试态
	if (connection === 'disconnected') {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
				<WifiOff size={28} className="text-[var(--color-error)]" />
				<div>
					<p className="text-sm text-[var(--color-text)]">与 Coding Agent 的连接已断开</p>
					<p className="mt-1 text-xs text-[var(--color-text-muted)]">sidecar 进程可能已退出</p>
				</div>
				<button
					type="button"
					onClick={() => connect()}
					className="flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-primary-hover)]"
				>
					<RefreshCw size={13} /> 重新连接
				</button>
			</div>
		);
	}

	// ready 但未登录：显示登录页
	if (!loggedIn) {
		return <LoginPage />;
	}

	// ready：主界面
	return (
		<div className="flex h-full flex-col">
			{/* 顶栏仅承载应用标识与当前用户，模型设置放在输入区附近以贴近发送行为。 */}
			<header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-2.5">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-[var(--color-text)]">GitPilot</span>
					{!isTauriEnv() && <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">mock 预览</span>}
				</div>
				<div
					className="flex size-8 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]"
					role="img"
					aria-label="当前用户头像"
					title="当前用户"
				>
					<CircleUserRound size={18} />
				</div>
			</header>

			{/* 主体：侧栏 + 对话 */}
			<div className="flex flex-1 overflow-hidden">
				<SessionSidebar />
				<main className="flex flex-1 flex-col overflow-hidden">
					<ChatView />
					<InputBox />
				</main>
			</div>

			{/* 扩展 UI 模态 */}
			<ExtensionUIModal />

			{/* 错误提示 */}
			{error && (
				<div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-bg-elevated)] px-4 py-3 text-sm text-[var(--color-error)] shadow-lg">
					<span className="max-w-80">{error}</span>
					<button type="button" onClick={clearError} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
						<X size={14} />
					</button>
				</div>
			)}
		</div>
	);
}
