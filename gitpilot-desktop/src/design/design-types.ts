export type DesignFileName = 'index.html' | 'styles.css' | 'main.js';
export type DesignTab = 'preview' | 'code';
export type DesignTarget = 'mobile' | 'tablet' | 'desktop';

export interface DesignFile {
	path: DesignFileName;
	language: 'html' | 'css' | 'javascript';
	content: string;
}

export interface DesignPage {
	id: string;
	name: string;
	route: string;
	files: DesignFile[];
}

export interface DesignRevision {
	id: string;
	prompt: string;
	summary: string;
	createdAt: string;
}

export interface DesignDocument {
	id: string;
	name: string;
	version: number;
	entryPageId: string;
	pages: DesignPage[];
	revisions: DesignRevision[];
}

export interface DesignPlan {
	title: string;
	summary: string;
	files: DesignFileName[];
	risks: string[];
}

export type DesignMessage =
	| { id: string; kind: 'user'; text: string }
	| { id: string; kind: 'assistant'; text: string }
	| { id: string; kind: 'plan'; plan: DesignPlan }
	| { id: string; kind: 'result'; revisionId: string; summary: string }
	| { id: string; kind: 'error'; text: string };

export interface DesignSnapshot {
	document: DesignDocument;
	files: DesignFile[];
}

export const DESIGN_TARGETS: Record<DesignTarget, { label: string; width: number; height: number }> = {
	mobile: { label: '手机', width: 375, height: 812 },
	tablet: { label: '平板', width: 768, height: 1024 },
	desktop: { label: '桌面', width: 1440, height: 900 },
};

const demoHtml = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>灵感工坊</title></head>
<body>
  <div class="grain"></div>
  <header class="nav"><div class="brand"><span class="brand-mark">◉</span><span>灵感工坊</span></div><nav><a href="#work">案例</a><a href="#process">流程</a><a href="#about">关于</a></nav><button data-design-id="nav-cta" class="nav-cta">开始项目 ↗</button></header>
  <main><section class="hero" data-design-id="hero"><div class="eyebrow">新品 <span>AI 驱动的网页设计</span></div><h1>值得被看见的品牌网站。</h1><p>惊艳的设计，极致的性能。由 AI 构想，再由专家打磨。</p><div class="actions"><button data-design-id="hero-cta" class="primary">开始设计 ↗</button><button class="ghost">观看影片 <span>▶</span></button></div></section><section class="logos" id="work"><span>星河</span><span>云端</span><span>线性</span><span>灵感</span><span>画板</span></section></main>
  <footer><span>© 2025 灵感工坊</span><span>由设计模式生成</span></footer>
</body></html>`;

const demoCss = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f5f4ed;background:#071111}*{box-sizing:border-box}body{min-height:100vh;margin:0;overflow:hidden;background:radial-gradient(circle at 50% 20%,#294b49 0%,#112526 30%,#060c0e 72%);position:relative}.grain{position:absolute;inset:0;opacity:.18;pointer-events:none;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:4px 4px;mix-blend-mode:soft-light}.nav{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:30px 48px}.brand{display:flex;align-items:center;gap:10px;font-family:Georgia,serif;font-size:17px}.brand-mark{display:grid;place-items:center;width:25px;height:25px;border:1px solid #d9ddca;border-radius:50%;font-size:12px}.nav nav{display:flex;gap:30px}.nav a{color:#cbd0c3;text-decoration:none;font-size:12px}.nav-cta,.primary{border:1px solid #d7dbc8;border-radius:999px;background:#edf0dd;color:#0b1413;padding:11px 17px;font-weight:700}.hero{position:relative;z-index:1;display:flex;min-height:calc(100vh - 180px);align-items:center;justify-content:center;flex-direction:column;padding:40px 24px;text-align:center}.eyebrow{display:inline-flex;gap:8px;align-items:center;border:1px solid #647b73;border-radius:999px;padding:7px 11px;color:#f0f2df;font-size:10px;letter-spacing:.08em}.eyebrow span{color:#9eb4aa;letter-spacing:0;text-transform:none}.hero h1{max-width:850px;margin:24px 0 18px;font-family:Georgia,serif;font-size:clamp(54px,8vw,112px);font-style:italic;font-weight:400;line-height:.95;letter-spacing:-.065em}.hero p{max-width:430px;margin:0;color:#aab7ac;line-height:1.6;font-size:14px}.actions{display:flex;gap:12px;margin-top:30px}.ghost{border:0;background:transparent;color:#edf0dd;padding:11px 15px}.ghost span{display:inline-grid;place-items:center;width:20px;height:20px;margin-left:4px;border:1px solid #687c73;border-radius:50%;font-size:8px}.logos{position:relative;z-index:2;display:flex;justify-content:center;gap:65px;color:#d7dbcb;font-family:Georgia,serif;font-size:20px;font-style:italic}.logos span{opacity:.85}footer{position:absolute;right:30px;bottom:18px;left:30px;display:flex;justify-content:space-between;color:#748780;font-size:10px}@media(max-width:700px){.nav{padding:20px 18px}.nav nav{display:none}.nav-cta{padding:9px 12px;font-size:11px}.hero{min-height:calc(100vh - 150px);padding-top:15px}.hero h1{font-size:clamp(45px,15vw,76px)}.hero p{font-size:13px}.actions{flex-direction:column;width:min(260px,100%)}.primary,.ghost{width:100%}.logos{gap:14px;flex-wrap:wrap;padding:0 18px;font-size:16px}footer{right:18px;bottom:12px;left:18px}}
`;

const demoJs = `document.querySelectorAll('[data-design-id]').forEach((element)=>element.addEventListener('click',(event)=>{event.preventDefault();window.parent.postMessage({type:'design:select',id:element.dataset.designId},'*')}));`;

export function createDemoSnapshot(): DesignSnapshot {
	const page: DesignPage = { id: 'home', name: '首页', route: '/', files: [
		{ path: 'index.html', language: 'html', content: demoHtml },
		{ path: 'styles.css', language: 'css', content: demoCss },
		{ path: 'main.js', language: 'javascript', content: demoJs },
	] };
	return { document: { id: 'studio-ai', name: '灵感工坊首页', version: 1, entryPageId: page.id, pages: [page], revisions: [{ id: 'rev-1', prompt: '设计一个电影感的 AI 创意工作室首页', summary: '已创建灵感工坊首页初稿', createdAt: new Date().toISOString() }] }, files: page.files };
}
