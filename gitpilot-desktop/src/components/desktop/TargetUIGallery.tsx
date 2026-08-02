/** 开发态视觉画廊：用于快速检查 token、焦点、长文本、状态和 reduced-motion。 */
import { useEffect } from 'react';
import { Check, CircleAlert, LoaderCircle, Pencil, Search, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { TargetSessionSidebar } from '@/src/components/workbench/TargetSessionSidebar';
import { TargetExecutionInspector } from '@/src/components/features/TargetExecutionInspector';
import { MessageBubble } from '@/src/components/MessageBubble';
import { ModelPicker } from '@/src/components/ModelPicker';
import { useSessionStore, type UIMessage } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import type { ModelInfo, RpcSessionState, SessionListItem } from '@/src/rpc/types';
import type { ExecutionStep } from '@/src/store/workbench';
import styles from './TargetUIGallery.module.css';

// 业务意图：长模型名必须走真实模型触发器，验证固定操作区不会被名称挤出可视范围。
const GALLERY_MODEL: ModelInfo = {
	id: 'gallery-long-model',
	name: 'GitPilot Enterprise Reasoning Model / 128K Context / 中文长名称验收版本',
	api: 'chat',
	provider: 'gallery',
	reasoning: true,
};

const GALLERY_SESSION_STATE: RpcSessionState = {
	model: GALLERY_MODEL,
	thinkingLevel: 'high',
	isStreaming: false,
	isCompacting: false,
	steeringMode: 'all',
	followUpMode: 'all',
	sessionId: 'gallery-session',
	sessionName: 'UI Gallery 长场景',
	autoCompactionEnabled: true,
	messageCount: 4,
	pendingMessageCount: 0,
};

const INLINE_CODE = String.fromCharCode(96);
const CODE_FENCE = INLINE_CODE.repeat(3);
// 业务意图：统一的长正文夹具让三档窗口截图可以重复比较换行、表格和代码滚动。
const LONG_MARKDOWN = `## 长正文、代码块与表格

这段内容用于验证助手正文在窄窗口、长行和混合 Markdown 下仍然可读。路径 ${INLINE_CODE}src/components/desktop/TargetDesktopShell.tsx${INLINE_CODE} 应保持等宽显示并允许长单词换行。

| 场景 | 预期行为 | 验证重点 |
| --- | --- | --- |
| 长正文 | 正常换行 | 不撑破中心区 |
| 代码块 | 横向滚动 | 保留缩进与颜色 |
| 表格 | 列宽稳定 | 窄窗口可滚动 |

${CODE_FENCE}tsx
export function StableWorkbenchLayout() {
  return <TargetDesktopShell className="overflow-hidden" />;
}
${CODE_FENCE}

后续段落重复用于观察滚动锚点、时间轴定位和执行摘要之间的间距。`.repeat(5);

// 业务意图：附件数量和文件名长度固定，避免人工添加附件导致验收结果漂移。
const GALLERY_ATTACHMENTS = Array.from({ length: 60 }, (_, index) => ({
	name: `附件-${String(index + 1).padStart(2, '0')}-超长文件名-${'资料'.repeat(5)}.${index % 3 === 0 ? 'png' : index % 3 === 1 ? 'md' : 'pdf'}`,
	kind: (index % 3 === 0 ? 'image' : index % 3 === 1 ? 'text' : 'document') as 'image' | 'text' | 'document',
	mimeType: index % 3 === 0 ? 'image/png' : index % 3 === 1 ? 'text/markdown' : 'application/pdf',
	sizeBytes: 1024 * (index + 1),
}));

// 业务意图：连续工具回合必须保留真实步骤分类，检查摘要与展开详情的边界。
const GALLERY_EXECUTION_STEPS: ExecutionStep[] = Array.from({ length: 13 }, (_, index) => ({
	id: `gallery-tool-${index}`,
	toolCallId: `gallery-tool-${index}`,
	kind: (['read', 'edit', 'command', 'verify'] as const)[index % 4],
	status: 'succeeded',
	title: ['read_file', 'apply_patch', 'shell_command', 'verify_build'][index % 4],
	args: JSON.stringify({ path: `src/components/features/gallery-fixture-${index}.tsx` }),
	result: `工具批次 ${index + 1} 已完成，输出包含长路径与连续步骤。`,
	startedAt: Date.now() - (13 - index) * 1000,
	endedAt: Date.now() - (12 - index) * 1000,
}));

const GALLERY_MESSAGES: UIMessage[] = [
	{ id: 'gallery-user-long', role: 'user', kind: 'text', text: '请检查这组长正文和附件场景。', attachments: GALLERY_ATTACHMENTS },
	{ id: 'gallery-assistant-long', role: 'assistant', kind: 'text', text: LONG_MARKDOWN },
	{ id: 'gallery-execution', role: 'assistant', kind: 'execution', text: '', executionSteps: GALLERY_EXECUTION_STEPS },
];

export function TargetUIGallery() {
	const galleryLoggedIn = useSessionStore((state) => state.loggedIn);
	useEffect(() => {
		// 业务意图：原生验收必须有稳定的 60 任务长列表，不依赖用户本机的真实会话数据。
		const now = new Date().toISOString();
		const sessions: SessionListItem[] = Array.from({ length: 60 }, (_, index) => ({
			path: `fixture-session-${index}`,
			id: `fixture-${index}`,
			name: `用于验证最大宽度和滚动的超长任务名称-${index}-${'长'.repeat(18)}`,
			cwd: 'C:\\fixture\\超长项目文件夹名称\\nested',
			created: now,
			modified: new Date(Date.now() - index * 1000).toISOString(),
			messageCount: index + 1,
			firstMessage: '',
		}));
		useSessionStore.setState({
			connection: 'ready',
			models: [GALLERY_MODEL],
			sessionState: GALLERY_SESSION_STATE,
			thinkingLevels: ['off', 'low', 'medium', 'high'],
			messages: GALLERY_MESSAGES,
			projects: [{ name: `用于验证侧栏宽度的超长项目文件夹-${'项'.repeat(18)}`, path: 'C:\\fixture\\超长项目文件夹名称' }],
			sessions,
			standaloneTaskPaths: [],
			currentProjectPath: 'C:\\fixture\\超长项目文件夹名称',
		});
		useSessionStore.getState().markLoggedIn();
		useWorkbenchStore.setState({
			execution: { id: 'gallery-run', status: 'completed', lastPrompt: '检查 UI Gallery 执行轨道', thinking: '', lastDeltaKind: 'tool', steps: GALLERY_EXECUTION_STEPS, reportedStepIds: [] },
			selectedStepId: GALLERY_EXECUTION_STEPS.at(-1)?.id ?? null,
		});
		return () => {
			useSessionStore.setState({ projects: [], sessions: [], standaloneTaskPaths: [], currentProjectPath: null, messages: [], models: [], sessionState: null });
			useWorkbenchStore.setState({ execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] }, selectedStepId: null });
		};
	}, []);

	return <main className={styles.root}><header><span>GITPILOT / UI GALLERY</span><small>开发态视觉验收，不参与生产工作台路由</small></header><section className={styles.grid}>
		<div className={styles.card}><h2>基础动作</h2><div className={styles.row}><Button size="sm">主要动作</Button><Button size="sm" variant="secondary">次要动作</Button><Button size="icon-sm" variant="ghost" aria-label="编辑"><Pencil /></Button><Button size="icon-sm" variant="outline" aria-label="搜索"><Search /></Button></div><label className={styles.field}>长文本输入<Input placeholder="超长模型名称或工作目录会在容器内省略" /></label></div>
		<div className={styles.card}><h2>执行状态</h2><div className={styles.state}><span className={styles.success}><Check /> 已完成</span><span className={styles.warning}><LoaderCircle /> 运行中</span><span className={styles.error}><CircleAlert /> 失败</span></div><div className={styles.long}>C:\Users\dlhxy\Downloads\Programs\git-ai-club\gitpilot-desktop\src\components\features\TargetExecutionInspector.tsx</div></div>
		<div className={`${styles.card} ${styles.modelCard}`}><h2>模型与长名称</h2>{galleryLoggedIn ? <ModelPicker /> : <div className={styles.modelTriggerFixture}>◉ <span>GitPilot Enterprise Reasoning Model / 128K Context / 中文长名称验收版本</span></div>}<div className={styles.long}>GitPilot Enterprise Reasoning Model / 128K Context / 中文长名称验收版本</div></div>
		<div className={`${styles.card} ${styles.messageCard}`}><h2>长正文、代码块与表格</h2><div className={styles.messageFixture}><MessageBubble message={GALLERY_MESSAGES[1]} /></div></div>
		<div className={`${styles.card} ${styles.messageCard}`}><h2>大附件列表（60 项）</h2><div className={styles.messageFixture}><MessageBubble message={GALLERY_MESSAGES[0]} /></div></div>
		<div className={`${styles.card} ${styles.messageCard}`}><h2>连续工具批次（13 步）</h2><div className={styles.messageFixture}><MessageBubble message={GALLERY_MESSAGES[2]} /></div></div>
		<div className={`${styles.card} ${styles.focusCard}`}><h2>焦点与操作区</h2><Button variant="outline">Tab 键聚焦后应有清晰 ring</Button><Button variant="ghost" size="icon-sm" aria-label="关闭"><X /></Button></div>
		<div className={styles.card}><h2>侧栏长列表</h2><div className={styles.sidebarFixture}><TargetSessionSidebar /></div></div>
		<div className={`${styles.card} ${styles.executionCard}`}><h2>执行轨道与详情</h2><div className={styles.executionFixture}><TargetExecutionInspector /></div></div>
	</section></main>;
}
