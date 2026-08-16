export type DesignFileName = string;
export type DesignTab = 'preview' | 'code';
export type DesignTarget = 'mobile' | 'tablet' | 'desktop';

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

/** 平台随 Desktop 构建发布的只读预设；HTML 只允许进入受限预览，不能成为项目文件。 */
export interface DesignPreset {
	id: string;
	title: string;
	description: string;
	entryFile: 'index.html';
	viewports: DesignPresetViewport[];
	tokens: DesignProjectGuidelines['tokens'];
	handoff: DesignPresetHandoff;
	/** 保留原始交接 Markdown，供预设详情按文档层级阅读。 */
	handoffMarkdown: string;
	guidelines: DesignProjectGuidelines;
	previewHtml: string;
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

export type DesignExecutionStatus = 'idle' | 'starting' | 'running' | 'awaiting_approval' | 'completed' | 'stopped' | 'failed';
export type DesignExecutionPhase = 'idle' | 'thinking' | 'responding' | 'tool' | 'applying_patch' | 'awaiting_approval';
export interface DesignExecutionStep {
	id: string;
	toolCallId?: string;
	toolName: string;
	status: 'running' | 'succeeded' | 'failed';
	args?: unknown;
	result?: unknown;
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

const demoHtml = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>GitPilot</title></head>
<body>
  <div class="grain"></div>
  <header class="nav"><div class="brand"><span class="brand-mark">◉</span><span>GitPilot</span></div><nav><a href="#work">案例</a><a href="#process">流程</a><a href="#about">关于</a></nav><button data-design-id="nav-cta" class="nav-cta">开始项目 ↗</button></header>
  <main><section class="hero" data-design-id="hero"><div class="eyebrow">新品 <span>AI 驱动的网页设计</span></div><h1>值得被看见的品牌网站。</h1><p>惊艳的设计，极致的性能。由 AI 构想，再由专家打磨。</p><div class="actions"><button data-design-id="hero-cta" class="primary">开始设计 ↗</button><button class="ghost">观看影片 <span>▶</span></button></div></section><section class="logos" id="work"><span>星河</span><span>云端</span><span>线性</span><span>灵感</span><span>画板</span></section></main>
  <footer><span>© 2025 GitPilot</span><span>由设计模式生成</span></footer>
</body></html>`;

const demoCss = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f5f4ed;background:#071111}*{box-sizing:border-box}body{min-height:100vh;margin:0;overflow:hidden;background:radial-gradient(circle at 50% 20%,#294b49 0%,#112526 30%,#060c0e 72%);position:relative}.grain{position:absolute;inset:0;opacity:.18;pointer-events:none;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:4px 4px;mix-blend-mode:soft-light}.nav{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:30px 48px}.brand{display:flex;align-items:center;gap:10px;font-family:Georgia,serif;font-size:17px}.brand-mark{display:grid;place-items:center;width:25px;height:25px;border:1px solid #d9ddca;border-radius:50%;font-size:12px}.nav nav{display:flex;gap:30px}.nav a{color:#cbd0c3;text-decoration:none;font-size:12px}.nav-cta,.primary{border:1px solid #d7dbc8;border-radius:999px;background:#edf0dd;color:#0b1413;padding:11px 17px;font-weight:700}.hero{position:relative;z-index:1;display:flex;min-height:calc(100vh - 180px);align-items:center;justify-content:center;flex-direction:column;padding:40px 24px;text-align:center}.eyebrow{display:inline-flex;gap:8px;align-items:center;border:1px solid #647b73;border-radius:999px;padding:7px 11px;color:#f0f2df;font-size:10px;letter-spacing:.08em}.eyebrow span{color:#9eb4aa;letter-spacing:0;text-transform:none}.hero h1{max-width:850px;margin:24px 0 18px;font-family:Georgia,serif;font-size:clamp(54px,8vw,112px);font-style:italic;font-weight:400;line-height:.95;letter-spacing:-.065em}.hero p{max-width:430px;margin:0;color:#aab7ac;line-height:1.6;font-size:14px}.actions{display:flex;gap:12px;margin-top:30px}.ghost{border:0;background:transparent;color:#edf0dd;padding:11px 15px}.ghost span{display:inline-grid;place-items:center;width:20px;height:20px;margin-left:4px;border:1px solid #687c73;border-radius:50%;font-size:8px}.logos{position:relative;z-index:2;display:flex;justify-content:center;gap:65px;color:#d7dbcb;font-family:Georgia,serif;font-size:20px;font-style:italic}.logos span{opacity:.85}footer{position:absolute;right:30px;bottom:18px;left:30px;display:flex;justify-content:space-between;color:#748780;font-size:10px}@media(max-width:700px){.nav{padding:20px 18px}.nav nav{display:none}.nav-cta{padding:9px 12px;font-size:11px}.hero{min-height:calc(100vh - 150px);padding-top:15px}.hero h1{font-size:clamp(45px,15vw,76px)}.hero p{font-size:13px}.actions{flex-direction:column;width:min(260px,100%)}.primary,.ghost{width:100%}.logos{gap:14px;flex-wrap:wrap;padding:0 18px;font-size:16px}footer{right:18px;bottom:12px;left:18px}}
`;

const demoJs = `document.querySelectorAll('[data-design-id]').forEach((element)=>element.addEventListener('click',(event)=>{event.preventDefault();window.parent.postMessage({type:'design:select',id:element.dataset.designId},'*')}));`;

export function createDemoSnapshot(): DesignSnapshot {
	const files: DesignFile[] = [
		{ id: 'home-index', path: 'pages/home/index.html', scope: 'page', language: 'html', content: demoHtml },
		{ id: 'home-styles', path: 'pages/home/styles.css', scope: 'page', language: 'css', content: demoCss },
		{ id: 'home-main', path: 'pages/home/main.js', scope: 'page', language: 'javascript', content: demoJs },
	];
	const page: DesignPage = { id: 'home', name: '首页', route: '/', entryFileId: 'home-index', fileIds: files.map((file) => file.id!) };
	return { document: { id: 'gitpilot-design', name: '灵感工坊首页', version: 1, entryPageId: page.id, pages: [page], files: files.map(({ content: _content, ...file }) => file), revisions: [{ id: 'rev-1', prompt: '设计一个电影感的创意工作室首页', summary: '已创建灵感工坊首页初稿', createdAt: new Date().toISOString() }] }, files };
}
