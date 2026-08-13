import { create } from 'zustand';
import { rpc } from '@/src/rpc/bridge';
import { createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignDocument, type DesignFileName, type DesignMessage, type DesignPlan, type DesignSnapshot, type DesignTarget, type DesignViewport } from '@/src/design/design-types';

const STORAGE_KEY = 'gitpilot-desktop.design-snapshot';
const STARTED_KEY = 'gitpilot-desktop.design-started';
const newId = () => `design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function loadSnapshot(): DesignSnapshot {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as DesignSnapshot;
	} catch { /* 损坏的本地缓存不应阻断设计工作台启动 */ }
	return createDemoSnapshot();
}

function saveSnapshot(snapshot: DesignSnapshot | null): void {
	try { if (snapshot) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* 存储空间不足时仍保留当前内存预览 */ }
}

function readStarted(): boolean {
	try { return localStorage.getItem(STARTED_KEY) === 'true'; } catch { return false; }
}

export interface DesignState {
	snapshot: DesignSnapshot;
	activePageId: string;
	activeFile: DesignFileName;
	activeTab: 'preview' | 'code';
	target: DesignTarget;
	viewport: DesignViewport;
	zoom: number;
	selectedElementId: string | null;
	messages: DesignMessage[];
	pendingPlan: DesignPlan | null;
	isGenerating: boolean;
	error: string | null;
	isProjectStarted: boolean;
	setTab: (tab: 'preview' | 'code') => void;
	setTarget: (target: DesignTarget) => void;
	setViewport: (viewport: DesignViewport) => void;
	setZoom: (zoom: number) => void;
	setActiveFile: (file: DesignFileName) => void;
	selectElement: (id: string | null) => void;
	applyPlan: () => Promise<void>;
	dismissPlan: () => void;
	sendPrompt: (text: string) => Promise<void>;
	revert: () => void;
	exportDesign: () => Promise<void>;
	clearError: () => void;
	startProject: (prompt: string) => Promise<void>;
	resetProject: () => void;
}

function updateLatest(snapshot: DesignSnapshot, prompt: string, summary: string, files = snapshot.files): DesignSnapshot {
	const revisionId = newId();
	const pageId = snapshot.document.entryPageId;
	const pages = snapshot.document.pages.map((page) => page.id === pageId ? { ...page, files } : page);
	const document: DesignDocument = { ...snapshot.document, version: snapshot.document.version + 1, pages, revisions: [...snapshot.document.revisions, { id: revisionId, prompt, summary, createdAt: new Date().toISOString() }] };
	return { document, files };
}

function applyMockPrompt(snapshot: DesignSnapshot, prompt: string): { next: DesignSnapshot; summary: string } {
	const files = snapshot.files.map((file) => {
		if (file.path !== 'styles.css') return file;
		const lime = /荧光绿|lime|绿色|green/i.test(prompt);
		return lime ? { ...file, content: file.content.replace('#edf0dd', '#c7ff54').replace('#0b1413', '#111909') } : file;
	});
	return { next: updateLatest(snapshot, prompt, limeSummary(prompt), files), summary: limeSummary(prompt) };
}

function limeSummary(prompt: string): string { return /荧光绿|lime|绿色|green/i.test(prompt) ? '已将主按钮调整为更醒目的荧光绿色。' : '已根据你的需求更新灵感工坊首页。'; }

export const useDesignStore = create<DesignState>((set, get) => {
	const initial = loadSnapshot();
	return {
		snapshot: initial,
		activePageId: initial.document.entryPageId,
		activeFile: 'index.html',
		activeTab: 'preview',
		target: 'desktop',
		viewport: { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height },
		zoom: 100,
		selectedElementId: null,
		messages: [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }],
		isProjectStarted: readStarted(),
		pendingPlan: null,
		isGenerating: false,
		error: null,
		setTab: (activeTab) => set({ activeTab }),
		setTarget: (target) => {
			const preset = DESIGN_VIEWPORT_PRESETS[target][0] ?? DESIGN_TARGETS[target];
			set({ target, viewport: { width: preset.width, height: preset.height } });
		},
		setViewport: (viewport) => set({ viewport }),
		setZoom: (zoom) => set({ zoom }),
		setActiveFile: (activeFile) => set({ activeFile }),
		selectElement: (selectedElementId) => set({ selectedElementId }),
		dismissPlan: () => set({ pendingPlan: null }),
		applyPlan: async () => {
			const plan = get().pendingPlan;
			if (!plan) return;
			set({ pendingPlan: null });
			await get().sendPrompt(plan.summary);
		},
		sendPrompt: async (text) => {
			const prompt = text.trim();
			if (!prompt || get().isGenerating) return;
			set((state) => ({ isGenerating: true, error: null, messages: [...state.messages, { id: newId(), kind: 'user', text: prompt }] }));
			try {
				const response = await rpc.designGenerate({ designId: get().snapshot.document.id, pageId: get().activePageId, prompt, baseRevisionId: get().snapshot.document.revisions.at(-1)?.id, targetProfiles: ['mobile', 'tablet', 'desktop'] });
				if (response.success && response.command === 'design_generate' && response.data?.snapshot) {
					const next = response.data.snapshot as unknown as DesignSnapshot;
					saveSnapshot(next); set((state) => ({ snapshot: next, messages: [...state.messages, { id: newId(), kind: 'result', revisionId: next.document.revisions.at(-1)?.id ?? 'revision', summary: response.data.summary ?? '设计已更新。' }] }));
				} else {
					const detail = response.success ? 'Design sidecar 未返回生成快照' : response.error;
					set((state) => ({ error: detail, messages: [...state.messages, { id: newId(), kind: 'error', text: `生成失败：${detail}` }] }));
					return;
					const plan: DesignPlan = { title: '优化首页设计', summary: prompt, files: ['index.html', 'styles.css', 'main.js'], risks: ['请在手机视图检查间距和换行。'] };
					set((state) => ({ pendingPlan: plan, messages: [...state.messages, { id: newId(), kind: 'plan', plan }] }));
					await new Promise((resolve) => setTimeout(resolve, 500));
					const result = applyMockPrompt(get().snapshot, prompt); saveSnapshot(result.next); set((state) => ({ snapshot: result.next, pendingPlan: null, messages: [...state.messages, { id: newId(), kind: 'result', revisionId: result.next.document.revisions.at(-1)?.id ?? 'revision', summary: result.summary }] }));
				}
			} catch (error) { set((state) => ({ error: error instanceof Error ? error.message : String(error), messages: [...state.messages, { id: newId(), kind: 'error', text: '生成失败，请重试。' }] })); }
			finally { set({ isGenerating: false }); }
		},
		revert: () => {
			const current = get().snapshot;
			if (current.document.revisions.length < 2) return;
			const previous = createDemoSnapshot();
			saveSnapshot(previous); set({ snapshot: previous, activePageId: previous.document.entryPageId, error: null, messages: [...get().messages, { id: newId(), kind: 'assistant', text: '已回滚到初始版本。' }] });
		},
		exportDesign: async () => {
			try {
				const response = await rpc.designExport(get().snapshot.document.id);
				if (!response.success) throw new Error(response.error || 'Export failed');
				set((state) => ({ messages: [...state.messages, { id: newId(), kind: 'assistant', text: 'HTML 原型已成功导出。' }] }));
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		clearError: () => set({ error: null }),
		startProject: async (prompt) => {
			try { localStorage.setItem(STARTED_KEY, 'true'); } catch { /* 本地存储不可用时仍允许进入工作台 */ }
			set({ isProjectStarted: true });
			await get().sendPrompt(prompt);
		},
		resetProject: () => {
			try { localStorage.removeItem(STARTED_KEY); } catch {}
			// 返回设计入口后清空上一轮会话，避免新项目在生成前复用旧结果并提前展示预览。
			set({ isProjectStarted: false, messages: [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }], pendingPlan: null, selectedElementId: null, error: null });
		},
	};
});
