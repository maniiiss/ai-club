import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Eye, Palette, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { designPresetCatalog, filterDesignPresets } from '@/src/design/design-presets';
import type { DesignPreset } from '@/src/design/design-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import styles from './DesignPresetPicker.module.css';

interface DesignPresetPickerProps {
	selectedPresetId: string | null;
	onApply: (preset: DesignPreset) => Promise<void>;
	className?: string;
}

function tokenSummary(preset: DesignPreset): string {
	const colorCount = Object.keys(preset.tokens.colors).length;
	const typeCount = Object.keys(preset.tokens.typography).length;
	return `${colorCount} 色彩 · ${typeCount} 字体 · ${preset.viewports.length} 视口`;
}

const TOKEN_LABELS: Record<string, string> = {
	bg: '页面背景', surface: '内容表面', 'surface-warm': '暖色表面', fg: '正文文字', 'fg-2': '次级文字', muted: '弱化文字', meta: '提示文字',
	border: '常规边框', 'border-soft': '弱化边框', accent: '主要操作色', 'accent-on': '强调色上的文字', 'accent-hover': '主要操作色（悬停）',
	'accent-active': '主要操作色（按下）', success: '成功状态', warn: '警告状态', danger: '危险状态',
};

/** Token 键名是生成约束，详情页优先展示用户能直接理解的视觉角色。 */
function tokenLabel(name: string): string {
	if (TOKEN_LABELS[name]) return TOKEN_LABELS[name];
	if (name.includes('background') || name.includes('bg')) return '背景色';
	if (name.includes('surface')) return '内容表面';
	if (name.includes('border')) return '边框色';
	if (name.includes('accent')) return '强调色';
	if (name.includes('text') || name.includes('fg')) return '文字颜色';
	return '主题颜色';
}

function handoffMarkdown(markdown: string): string {
	return markdown.replace(/^\s*#\s+.+?(?:\r?\n)+/, '').trim();
}

function PreviewDialog({ preset, open, onOpenChange }: { preset: DesignPreset | null; open: boolean; onOpenChange: (open: boolean) => void }) {
	const [isFrameMounted, setIsFrameMounted] = useState(false);

	useEffect(() => {
		setIsFrameMounted(false);
		if (!open || !preset) return undefined;
		// 先完成 Dialog 的首帧和过渡，再解析预设里可能很重的完整组件 HTML。
		const timer = window.setTimeout(() => setIsFrameMounted(true), 180);
		return () => window.clearTimeout(timer);
	}, [open, preset?.id]);

	if (!preset) return null;
	return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.previewDialog} style={{ width: 'min(1120px, calc(100vw - 32px))', maxWidth: '1120px', maxHeight: 'calc(100dvh - 48px)' }} aria-describedby={undefined}>
		<DialogHeader className={styles.previewHeader}>
			<DialogTitle>{preset.title}</DialogTitle>
		</DialogHeader>
		<div className={styles.previewFrame} aria-busy={!isFrameMounted}>{isFrameMounted ? <iframe title={`${preset.title} 预览`} sandbox="" scrolling="auto" srcDoc={preset.previewHtml} /> : <div className={styles.previewLoading} role="status"><span /></div>}</div>
	</DialogContent></Dialog>;
}

/** 内置预设统一由 Catalog 提供，选择动作由父级决定是暂存还是立即写入项目规范。 */
export function DesignPresetPicker({ selectedPresetId, onApply, className }: DesignPresetPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [activeId, setActiveId] = useState<string | null>(selectedPresetId);
	const [previewPreset, setPreviewPreset] = useState<DesignPreset | null>(null);
	const [applying, setApplying] = useState(false);
	const [applyError, setApplyError] = useState<string | null>(null);
	const catalog = designPresetCatalog;
	const presets = useMemo(() => filterDesignPresets(catalog.presets, search), [catalog.presets, search]);
	const activePreset = presets.find((preset) => preset.id === activeId) ?? catalog.presets.find((preset) => preset.id === activeId) ?? presets[0] ?? null;
	const selectedPreset = catalog.presets.find((preset) => preset.id === selectedPresetId);

	const choose = async () => {
		if (!activePreset) return;
		setApplying(true);
		setApplyError(null);
		try {
			await onApply(activePreset);
			setOpen(false);
		} catch (error) {
			setApplyError(error instanceof Error ? error.message : String(error));
		} finally {
			setApplying(false);
		}
	};

	return <>
		<button type="button" className={`${styles.trigger} ${className ?? ''}`} onClick={() => { setActiveId(selectedPresetId ?? catalog.presets[0]?.id ?? null); setApplyError(null); setOpen(true); }}>
			<Palette size={14} /><span>预设</span><strong>{selectedPreset?.title ?? '未选择'}</strong>
		</button>
		<Dialog open={open} onOpenChange={setOpen}><DialogContent className={styles.catalogDialog} aria-describedby={undefined}>
			<DialogHeader className={styles.catalogHeader}>
				<DialogTitle>设计预设</DialogTitle>
			</DialogHeader>
			{catalog.presets.length === 0 ? <div className={styles.empty}><Palette size={21} /><strong>暂无内置预设</strong><span>将完整预设目录加入 Desktop 构建后会自动显示。</span>{catalog.issues.length > 0 && <small>{catalog.issues.length} 个目录未通过校验</small>}</div> : <div className={styles.catalogBody}>
				<aside className={styles.listPanel} aria-label="预设列表">
					<label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索预设" aria-label="搜索预设" /></label>
					<div className={styles.presetList}>{presets.length > 0 ? presets.map((preset) => <button type="button" key={preset.id} className={`${styles.presetItem} ${activePreset?.id === preset.id ? styles.presetItemActive : ''}`} onClick={() => setActiveId(preset.id)}><span className={styles.presetItemTop}><strong>{preset.title}</strong>{selectedPresetId === preset.id && <Check size={13} aria-label="当前已选择" />}</span><small>{tokenSummary(preset)}</small></button>) : <p className={styles.noResults}>没有匹配的预设</p>}</div>
				</aside>
				{activePreset && <section className={styles.detailPanel} aria-label={`${activePreset.title} 详情`}>
					<div className={styles.detailHeading}><div><strong>{activePreset.title}</strong><span>将此预设转换为当前工作空间的设计规范。</span></div><button type="button" className={styles.previewButton} onClick={() => setPreviewPreset(activePreset)}><Eye size={14} />预览</button></div>
					<section className={styles.tokenPanel}><span>核心颜色</span><div className={styles.swatches}>{Object.entries(activePreset.tokens.colors).slice(0, 6).map(([name, value]) => <span key={name} title={value}><i style={{ backgroundColor: value }} />{tokenLabel(name)}</span>)}</div><small>{tokenSummary(activePreset)}</small></section>
					<section className={styles.markdownPanel} aria-label={`${activePreset.title} 设计说明`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{handoffMarkdown(activePreset.handoffMarkdown)}</ReactMarkdown></section>
					{activePreset.warnings.length > 0 && <div className={styles.warnings}><AlertTriangle size={14} /><span>{activePreset.warnings[0]}</span></div>}
					{applyError && <p className={styles.applyError}>{applyError}</p>}
					<div className={styles.actions}><button type="button" className={styles.applyButton} onClick={() => void choose()} disabled={applying}>{applying ? '应用中' : selectedPresetId === activePreset.id ? '重新应用' : '选择预设'}</button></div>
				</section>}
			</div>}
		</DialogContent></Dialog>
		<PreviewDialog preset={previewPreset} open={Boolean(previewPreset)} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewPreset(null); }} />
	</>;
}
