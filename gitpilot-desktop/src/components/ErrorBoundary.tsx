/**
 * 全局错误边界。
 *
 * React 渲染阶段抛出的未捕获错误会卸载整棵组件树（表现为白屏）。
 * 此边界把错误显示为可读覆盖层，并支持一键复制错误信息，便于反馈与排查。
 * 事件处理器内的错误（如 onClick）不经过此边界，仅渲染/生命周期错误会触发。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/src/components/ui/button';
import styles from './ErrorBoundary.module.css';

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		// 保留完整调用栈到控制台（webview 开发者工具可见）
		console.error('[ErrorBoundary]', error, info.componentStack);
	}

	private copyError = () => {
		const { error } = this.state;
		if (!error) return;
		void navigator.clipboard?.writeText(`${error.message}\n\n${error.stack ?? ''}`).catch(() => undefined);
	};

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<div className={styles.root} role="alert">
				<h1 className={styles.title}>界面渲染出错</h1>
				<pre className={styles.detail}>{error.message}</pre>
				{error.stack && <pre className={styles.stack}>{error.stack}</pre>}
				<div className={styles.actions}>
					<Button type="button" variant="default" onClick={this.copyError}>复制错误信息</Button>
					<Button type="button" variant="ghost" onClick={() => window.location.reload()}>重新加载</Button>
				</div>
			</div>
		);
	}
}
