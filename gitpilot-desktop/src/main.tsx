/**
 * 应用入口。
 * 挂载 React 19 根节点，导入全局样式。
 * Tauri IPC 桥接在 App 组件内按生命周期初始化（见 src/App.tsx）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
