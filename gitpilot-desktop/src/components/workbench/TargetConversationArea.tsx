/** 目标中心阅读区：将聊天与输入器置于独立工作台边界，保留消息流和附件业务实现。 */
import { ChatView } from '@/src/components/ChatView';
import { InputBox } from '@/src/components/InputBox';
import { ExtensionActionsMenu } from '@/src/components/desktop/ExtensionActionsMenu';
import styles from './TargetConversationArea.module.css';

export function TargetConversationArea() {
	return <main className={styles.root} aria-label="对话工作区">
		<ExtensionActionsMenu />
		<ChatView />
		<InputBox />
	</main>;
}
