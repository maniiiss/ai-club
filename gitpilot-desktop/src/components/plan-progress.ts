/**
 * 将 sidecar 扩展 UI 的文本事件归一化为 Desktop 计划进度。
 *
 * Plannotator 在 TUI 中会给状态和清单行附加 ANSI 颜色码；Desktop 不应把
 * 这些终端控制字符带进 DOM，因此这里统一清洗并只保留计划展示需要的信息。
 */
export type PlanProgressStep = {
	ordinal: number;
	title: string;
	status: 'completed' | 'running' | 'pending';
};

export type PlanProgress = {
	completed: number;
	total: number;
	current: number;
	steps: PlanProgressStep[];
};

const ANSI_ESCAPE = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

/** 去掉 ANSI SGR/OSC 控制序列，兼容 Plannotator 的主题输出。 */
export function stripAnsi(value: string): string {
	return value.replace(ANSI_ESCAPE, '').replace(/\r/g, '').trim();
}

function isPlanKey(key: string): boolean {
	return /plan|plannotator/i.test(key);
}

function findProgressText(statuses: ReadonlyMap<string, string>): { completed: number; total: number } | null {
	for (const [key, raw] of statuses) {
		if (!isPlanKey(key)) continue;
		const text = stripAnsi(raw);
		const match = text.match(/(?:^|\s)(\d+)\s*\/\s*(\d+)(?:\s|$)/);
		if (!match) continue;
		const completed = Number(match[1]);
		const total = Number(match[2]);
		if (Number.isSafeInteger(completed) && Number.isSafeInteger(total) && total > 0 && completed >= 0 && completed <= total) {
			return { completed, total };
		}
	}
	return null;
}

function findPlanLines(widgets: ReadonlyMap<string, { lines: string[]; placement: 'aboveEditor' | 'belowEditor' }>): string[] {
	for (const [key, widget] of widgets) {
		if (isPlanKey(key) && widget.placement === 'aboveEditor' && widget.lines.length > 0) {
			return widget.lines.map(stripAnsi).filter(Boolean);
		}
	}
	return [];
}

function normalizeStepTitle(line: string): { title: string; completed: boolean } | null {
	const normalized = line.replace(/^\s*(?:[-*]\s*)?/, '').trim();
	if (!normalized) return null;
	const completedMatch = normalized.match(/^(?:☑|☒|✅|\[[xX]\])\s*(.*)$/);
	if (completedMatch) return { title: completedMatch[1].trim(), completed: true };
	const pendingMatch = normalized.match(/^(?:☐|⬜|\[\s\])\s*(.*)$/);
	if (pendingMatch) return { title: pendingMatch[1].trim(), completed: false };
	return null;
}

/**
 * 解析 Plannotator 的 `completed/total` 状态和 checklist widget。
 * 未完成步骤中第一项作为当前步骤，后续步骤保持等待态，保证没有额外的
 * “正在执行某工具”文案出现在输入框上方。
 */
export function parsePlanProgress(
	statuses: ReadonlyMap<string, string>,
	widgets: ReadonlyMap<string, { lines: string[]; placement: 'aboveEditor' | 'belowEditor' }>,
): PlanProgress | null {
	const progress = findProgressText(statuses);
	const lines = findPlanLines(widgets);
	if (!progress && lines.length === 0) return null;

	const parsed = lines.map(normalizeStepTitle).filter((step): step is { title: string; completed: boolean } => step !== null);
	const total = progress?.total ?? parsed.length;
	if (total <= 0) return null;
	const completed = Math.min(progress?.completed ?? parsed.filter((step) => step.completed).length, total);
	const steps: PlanProgressStep[] = [];
	for (let index = 0; index < total; index += 1) {
		const parsedStep = parsed[index];
		const isCompleted = index < completed || parsedStep?.completed === true;
		steps.push({
			ordinal: index + 1,
			title: parsedStep?.title || `第 ${index + 1} 步`,
			status: isCompleted ? 'completed' : index === completed && completed < total ? 'running' : 'pending',
		});
	}
	return {
		completed: steps.filter((step) => step.status === 'completed').length,
		total,
		current: Math.min(completed + 1, total),
		steps,
	};
}
