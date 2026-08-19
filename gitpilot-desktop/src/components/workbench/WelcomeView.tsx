/** 空会话欢迎页：标题、输入框与工作空间入口整体居中；有消息时由父级换回常规对话布局。 */
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useThemeStore } from '@/src/store/theme';
import { useWorkStore } from '@/src/store/work';
import { DesignLandingBackground } from '@/src/components/design/DesignLandingBackground';
import { WorkspaceChip } from './WorkspaceChip';
import styles from './WelcomeView.module.css';

type WelcomeMode = 'code' | 'work';
type WelcomeTime = 'late-night' | 'morning' | 'noon' | 'afternoon' | 'evening';

const WELCOME_COPY: Record<WelcomeTime, Record<WelcomeMode, string>> = {
	'late-night': { code: '辛苦了，最后一个问题也交给我', work: '辛苦了，重要的事慢慢推进' },
	morning: { code: '早上好，写下今天的第一行代码', work: '早上好，规划今天要推进的工作' },
	noon: { code: '中午好，趁灵感正好，把想法写成代码', work: '中午好，整理思路，继续推进工作' },
	afternoon: { code: '下午好，继续把难题拆开解决', work: '下午好，把关键任务再推进一步' },
	evening: { code: '晚上好，让代码把想法落地', work: '晚上好，收拢进展，准备下一步' },
};

/** 根据当前时段切换问候语，并让 Code/Work 保持各自的工作语境。 */
export function getWelcomeCopy(mode: WelcomeMode, hour = new Date().getHours()): string {
	const time: WelcomeTime = hour < 5 ? 'late-night' : hour < 11 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'evening';
	return WELCOME_COPY[time][mode];
}

interface WelcomeViewProps {
	/** 决定工作空间 chip 的数据源：Code 用会话项目，Work 用 Work 工作空间。 */
	mode: WelcomeMode;
	/** 各模式注入自己的输入组件（Code 用 InputBox，Work 用 WorkInputBox）。 */
	composer: ReactNode;
}

export function WelcomeView({ mode, composer }: WelcomeViewProps) {
	const theme = useThemeStore((s) => s.theme);
	const projects = useSessionStore((s) => s.projects);
	const currentProjectPath = useSessionStore((s) => s.currentProjectPath);
	const switchProject = useSessionStore((s) => s.switchProject);
	const addProject = useSessionStore((s) => s.addProject);
	const workspaces = useWorkStore((s) => s.workspaces);
	const currentWorkspacePath = useWorkStore((s) => s.currentWorkspacePath);
	const selectWorkspace = useWorkStore((s) => s.selectWorkspace);
	const addWorkspace = useWorkStore((s) => s.addWorkspace);

	return <div className={styles.root} data-welcome-mode={mode} data-welcome-theme={theme}>
		{/* 保留 Design Canvas 的粒子与主题场景；规则点阵由外层工作区背景负责，不在这里绘制。 */}
		<div className={styles.background} aria-hidden="true">
			<DesignLandingBackground theme={theme} />
		</div>
		<div className={styles.hero}>
			<span className={styles.heroIcon} aria-hidden="true"><Sparkles size={28} /></span>
			<h1 className={styles.title}>{getWelcomeCopy(mode)}</h1>
		</div>
		<div className={styles.composer}>{composer}</div>
		<div className={styles.chips}>
			{mode === 'code'
				? <WorkspaceChip items={projects} currentPath={currentProjectPath} onSelect={(path) => void switchProject(path)} onAdd={() => void addProject()} />
				: <WorkspaceChip items={workspaces} currentPath={currentWorkspacePath} onSelect={selectWorkspace} onAdd={() => void addWorkspace()} />}
			<span className={styles.permissionChip} title="桌面端默认在当前工作空间内读写文件，暂无独立权限模型">默认权限</span>
		</div>
	</div>;
}
