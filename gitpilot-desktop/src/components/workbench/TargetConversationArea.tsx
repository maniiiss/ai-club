/** 目标中心阅读区：将聊天与输入器置于独立工作台边界，保留消息流和附件业务实现。 */
import { ChatView } from '@/src/components/ChatView';
import { InputBox } from '@/src/components/InputBox';
import { WelcomeView } from '@/src/components/workbench/WelcomeView';
import { useSessionStore } from '@/src/store/session';
import styles from './TargetConversationArea.module.css';

export function TargetConversationArea() {
	// 空会话展示居中欢迎页；首个消息出现后回到常规消息流 + 悬浮输入框布局。
	const isEmpty = useSessionStore((s) => s.messages.length === 0 && !s.isSessionLoading);
	return <main className={styles.root} aria-label="对话工作区">
		{isEmpty ? <WelcomeView mode="code" composer={<InputBox variant="inline" />} /> : <><ChatView /><InputBox /></>}
	</main>;
}
