export type DesignFileName = string;
import type { CanvasDesignDocument } from './canvas-types';
import { createDefaultCanvasDocument } from './canvas-document';
export type DesignTab = 'preview' | 'code';
export type DesignTarget = 'mobile' | 'tablet' | 'desktop';
/** 预览展示方式：原始尺寸用于精确检查，自适应和浏览器模式用于完整查看右侧画布。 */
export type DesignPreviewMode = 'original' | 'fit' | 'browser';

/** 预览画布尺寸：既支持常用设备，也允许用户输入任意宽高。 */
export interface DesignViewport {
	width: number;
	height: number;
}

export interface DesignViewportPreset extends DesignViewport {
	id: string;
	label: string;
}

export interface DesignFile {
	id?: string;
	path: DesignFileName;
	scope?: 'page' | 'shared' | 'asset';
	language: 'html' | 'css' | 'javascript' | 'json' | 'image' | 'unknown';
	content: string;
	hash?: string;
}

export interface DesignPage {
	id: string;
	name: string;
	route: string;
	entryFileId: string;
	fileIds: string[];
	/** 兼容旧快照，读取后由 store 迁移为 fileIds。 */
	files?: DesignFile[];
}

export interface DesignRevision {
	id: string;
	prompt: string;
	summary: string;
	createdAt: string;
	/** 该修订基于哪个当前修订生成，便于时间线解释分支和回滚。 */
	parentRevisionId?: string;
	/** 回滚修订指向被恢复的历史修订；普通 patch 不设置。 */
	sourceRevisionId?: string;
	kind?: 'initial' | 'patch' | 'rollback';
}

export interface DesignUploadRecord {
	projectId: number;
	revisionId: string;
	versionId: number;
	versionNumber: number;
	status: 'DRAFT' | 'CURRENT' | 'ARCHIVED';
	uploadedAt: string;
}

export interface DesignDocument {
	id: string;
	name: string;
	version: number;
	entryPageId: string;
	pages: DesignPage[];
	files?: Array<Omit<DesignFile, 'content'>>;
	revisions: DesignRevision[];
	/** 原生 CanvasKit 设计稿的唯一视觉事实源；旧 files 字段仅保留给未迁移类型检查。 */
	canvas?: CanvasDesignDocument;
}

/** 项目级规范是 Design Agent 的长期上下文，避免每次对话重复描述品牌与可访问性要求。 */
export interface DesignProjectGuidelines {
	version: 1;
	brand: { name: string; tone: string };
	tokens: {
		colors: Record<string, string>;
		typography: Record<string, string>;
		spacing: Record<string, string>;
		radius: Record<string, string>;
		shadows: Record<string, string>;
	};
	components: Record<string, string>;
	rules: string[];
	accessibility: { minContrast: 'AA' | 'AAA' };
	updatedAt: string;
}

/** 内置 Design 预设声明的视口，用于预览和后续实现验收，不替换工作台本身的画布预设。 */
export interface DesignPresetViewport extends DesignViewport {
	id: string;
	label: string;
	category?: string;
}

export interface DesignPresetHandoff {
	brandDescription: string;
	componentRules: string[];
	layoutRules: string[];
	responsiveRules: string[];
	agentPromptGuide: string[];
}

/** 平台随 Desktop 构建发布的只读预设；预设视觉事实源是原生 Canvas 场景。 */
export interface DesignPreset {
	id: string;
	title: string;
	description: string;
	viewports: DesignPresetViewport[];
	tokens: DesignProjectGuidelines['tokens'];
	handoff: DesignPresetHandoff;
	/** 保留原始交接 Markdown，供预设详情按文档层级阅读。 */
	handoffMarkdown: string;
	guidelines: DesignProjectGuidelines;
	/** 预设缩略图和应用初稿使用的原生场景，运行时不读取 HTML 作为视觉事实源。 */
	scene?: CanvasDesignDocument;
	source?: string;
	license: string;
	attribution?: string;
	warnings: string[];
}

export interface DesignPlan {
	title: string;
	summary: string;
	files: DesignFileName[];
	risks: string[];
}

/** 首轮生成前收集的最小设计意图，避免把一次性的追问混入后续设计 revision。 */
export interface DesignIntake {
	sourcePrompt: string;
	step: number;
	status: 'pending' | 'confirmed' | 'skipped';
	answers: {
		productType?: string;
		visualTone?: string;
		layout?: string;
		notes?: string;
	};
	confirmedAt?: number;
}

/** 待办只表达当前 Design 工作区的执行进度，不参与页面文件或 revision 的事实源。 */
export interface DesignTodoItem {
	id: string;
	text: string;
	state: 'pending' | 'active' | 'done';
}

export type DesignExecutionStatus = 'idle' | 'starting' | 'running' | 'awaiting_clarification' | 'awaiting_approval' | 'completed' | 'stopped' | 'failed';
export type DesignExecutionPhase = 'idle' | 'thinking' | 'responding' | 'tool' | 'applying_patch' | 'compacting' | 'awaiting_clarification' | 'awaiting_approval';
export interface DesignExecutionStep {
	id: string;
	toolCallId?: string;
	toolName: string;
	/** 由 sidecar 脱敏后的展示摘要，只包含文件路径、数量和体积等轻量信息。 */
	summary?: string;
	status: 'running' | 'succeeded' | 'failed';
	startedAt: number;
	endedAt?: number;
}
export interface DesignExecution {
	status: DesignExecutionStatus;
	phase: DesignExecutionPhase;
	runId: string | null;
	requestId: string | null;
	sequence: number;
	lastDeltaKind?: 'thinking' | 'tool' | 'text';
	thinking: string;
	steps: DesignExecutionStep[];
	/** 最近一次上下文压缩的轻量结果；摘要正文仍留在 Agent 会话中，不进入 Design UI 状态。 */
	compactionNotice?: 'success' | 'failure';
	compactionError?: string;
	startedAt?: number;
	endedAt?: number;
}

export type DesignMessage =
	| { id: string; kind: 'user'; text: string; status?: 'queued' | 'sent' | 'cancelled' }
	| { id: string; kind: 'assistant'; text: string }
	| { id: string; kind: 'plan'; plan: DesignPlan }
	| { id: string; kind: 'result'; revisionId: string; summary: string }
	| { id: string; kind: 'error'; text: string };

export interface DesignSnapshot {
	document: DesignDocument;
	files: DesignFile[];
	context?: { projectId: string; projectPath: string; designId: string };
	guidelines?: DesignProjectGuidelines;
}

export function createDefaultProjectGuidelines(): DesignProjectGuidelines {
	return {
		version: 1,
		brand: { name: '', tone: '清晰、专业、易使用' },
		tokens: { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} },
		components: {},
		rules: [],
		accessibility: { minContrast: 'AA' },
		updatedAt: new Date().toISOString(),
	};
}

export const DESIGN_TARGETS: Record<DesignTarget, { label: string; width: number; height: number }> = {
	mobile: { label: '手机', width: 375, height: 812 },
	tablet: { label: '平板', width: 768, height: 1024 },
	desktop: { label: '桌面', width: 1440, height: 900 },
};

/**
 * 按设备类型分组的画布尺寸预设；切换设备后只展示当前类型的常用尺寸。
 * 自定义宽高仍由 Design Store 单独承载，不污染这些产品预设。
 */
export const DESIGN_VIEWPORT_PRESETS: Record<DesignTarget, DesignViewportPreset[]> = {
	mobile: [
		{ id: 'mobile-compact', label: '紧凑手机', width: 360, height: 800 },
		{ id: 'mobile-standard', label: '标准手机', width: 375, height: 812 },
		{ id: 'mobile-large', label: '大屏手机', width: 390, height: 844 },
		{ id: 'mobile-max', label: '超大屏手机', width: 430, height: 932 },
	],
	tablet: [
		{ id: 'tablet-portrait', label: '竖屏平板', width: 768, height: 1024 },
		{ id: 'tablet-air', label: '轻薄平板', width: 820, height: 1180 },
		{ id: 'tablet-pro', label: '专业平板', width: 1024, height: 1366 },
		{ id: 'tablet-landscape', label: '横屏平板', width: 1366, height: 1024 },
	],
	desktop: [
		{ id: 'desktop-workspace', label: '工作区', width: 1440, height: 900 },
		{ id: 'desktop-720p', label: '720p', width: 1280, height: 720 },
		{ id: 'desktop-1080p', label: '1080p', width: 1920, height: 1080 },
		{ id: 'desktop-2k', label: '2K', width: 2560, height: 1440 },
		{ id: 'desktop-4k', label: '4K', width: 3840, height: 2160 },
	],
};

export function createDemoSnapshot(): DesignSnapshot {
	const canvas = createDefaultCanvasDocument('gitpilot-design', '无限画板');
	const page: DesignPage = { id: canvas.pages[0].id, name: canvas.pages[0].name, route: canvas.pages[0].route, entryFileId: '', fileIds: [] };
	return { document: { id: canvas.id, name: canvas.name, version: canvas.revision, entryPageId: canvas.entryPageId, pages: [page], files: [], revisions: [{ id: 'rev-1', prompt: '创建一个可自由编辑的无限画板', summary: '已创建 CanvasKit 原生无限画板', createdAt: canvas.updatedAt, kind: 'initial' }], canvas }, files: [] };
}
