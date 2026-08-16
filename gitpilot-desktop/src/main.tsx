/**
 * 应用入口。
 * 挂载 React 19 根节点，导入全局样式。
 * Tauri IPC 桥接在 App 组件内按生命周期初始化（见 src/App.tsx）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { initializeDesktopPreferences } from './store/settings';
import { initializeTheme } from './store/theme';
import { NativeHintBridge, TooltipProvider } from './components/ui/tooltip';

// 在首帧渲染前恢复主题，避免从默认主题闪到用户上次选择的主题。
initializeTheme();
initializeDesktopPreferences();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ErrorBoundary>
			<TooltipProvider delayDuration={280} skipDelayDuration={100}>
				<NativeHintBridge />
				<App />
			</TooltipProvider>
		</ErrorBoundary>
	</StrictMode>,
);
