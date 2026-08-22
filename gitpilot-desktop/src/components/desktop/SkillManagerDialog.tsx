import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise as RefreshCw, Check, MagnifyingGlass as Search, Power as CirclePower, Sparkle as Sparkles, Warning as AlertTriangle } from '@phosphor-icons/react';
import { rpc } from '@/src/rpc/bridge';
import type { ManagedSkill, SkillMode } from '@/src/rpc/types';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import styles from './SkillManagerDialog.module.css';

const MODES: ReadonlyArray<{ value: SkillMode; label: string }> = [
	{ value: 'code', label: 'CODE' },
	{ value: 'work', label: 'WORK' },
	{ value: 'design', label: 'DESIGN' },
];

export type SkillSourceFilter = 'all' | ManagedSkill['source'];

export function nextSkillModes(current: SkillMode[], mode: SkillMode, checked: boolean): SkillMode[] {
	const next = checked ? [...new Set([...current, mode])] : current.filter((item) => item !== mode);
	return next.length > 0 ? next : current;
}

export function filterManagedSkills(skills: ManagedSkill[], query: string, source: SkillSourceFilter): ManagedSkill[] {
	const normalized = query.trim().toLocaleLowerCase();
	return skills.filter((skill) => {
		if (source !== 'all' && skill.source !== source) return false;
		if (!normalized) return true;
		return `${skill.name} ${skill.description} ${skill.filePath}`.toLocaleLowerCase().includes(normalized);
	});
}

function sourceLabel(source: ManagedSkill['source']): string {
	return source === 'builtin' ? '内置' : '个人';
}

function SkillRow({
	skill,
	onEnabled,
	onModes,
	busy,
}: {
	skill: ManagedSkill;
	onEnabled: (enabled: boolean) => void;
	onModes: (modes: SkillMode[]) => void;
	busy: boolean;
}) {
	return <article className={`${styles.skillCard} ${!skill.enabled ? styles.skillCardDisabled : ''}`}>
		<div className={styles.skillCardTop}>
			<div className={styles.skillIdentity}>
				<div className={styles.skillGlyph} aria-hidden="true"><Sparkles size={14} /></div>
				<div className={styles.skillCopy}>
					<div className={styles.skillTitleLine}><span className={styles.skillName}>{skill.name}</span><span className={`${styles.sourceBadge} ${skill.source === 'builtin' ? styles.sourceBadgeBuiltin : ''}`}>{sourceLabel(skill.source)}</span></div>
					<p>{skill.description}</p>
					<code title={skill.filePath}>{skill.filePath}</code>
				</div>
			</div>
			<button type="button" className={`${styles.powerButton} ${skill.enabled ? styles.powerButtonOn : ''}`} aria-pressed={skill.enabled} aria-label={skill.enabled ? `停用 ${skill.name}` : `启用 ${skill.name}`} disabled={busy} onClick={() => onEnabled(!skill.enabled)}><CirclePower size={17} /><span>{skill.enabled ? '已启用' : '已停用'}</span></button>
		</div>
		<div className={styles.skillCardBottom}>
			<span className={styles.modeLabel}>生效模式</span>
			<div className={styles.modeChoices} role="group" aria-label={`${skill.name} 生效模式`}>
				{MODES.map((mode) => {
					const checked = skill.modes.includes(mode.value);
					return <button key={mode.value} type="button" className={`${styles.modeChoice} ${checked ? styles.modeChoiceActive : ''}`} aria-pressed={checked} disabled={busy} onClick={() => onModes(nextSkillModes(skill.modes, mode.value, !checked))}><span className={styles.modeCheck} aria-hidden="true">{checked && <Check size={10} />}</span>{mode.label}</button>;
				})}
			</div>
			{skill.disableModelInvocation && <span className={styles.manualBadge}>仅支持手动调用</span>}
		</div>
	</article>;
}

/** 设置页的 Skill 管理分区：只修改用户级 Skill 的启用状态与模式范围。 */
export function SkillSettingsPanel() {
	const [skills, setSkills] = useState<ManagedSkill[]>([]);
	const [diagnostics, setDiagnostics] = useState<Array<{ type: string; message: string; path?: string }>>([]);
	const [query, setQuery] = useState('');
	const [source, setSource] = useState<SkillSourceFilter>('all');
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [deferredModes, setDeferredModes] = useState<SkillMode[]>([]);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const result = await rpc.skillList();
			if (!result.success || result.command !== 'skill_list') setError(result.success ? '读取 Skill 失败' : result.error);
			else { setSkills(result.data.skills); setDiagnostics(result.data.diagnostics); }
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setLoading(false); }
	}, []);

	useEffect(() => { void refresh(); }, [refresh]);

	const filtered = useMemo(() => filterManagedSkills(skills, query, source), [query, skills, source]);
	const builtin = filtered.filter((skill) => skill.source === 'builtin');
	const personal = filtered.filter((skill) => skill.source === 'personal');

	const mutate = async (action: () => ReturnType<typeof rpc.skillSetEnabled>) => {
		setBusy(true);
		setError('');
		try {
			const result = await action();
			if (!result.success || result.command !== 'skill_set_enabled' && result.command !== 'skill_set_modes' && result.command !== 'skill_reload' || !result.data) { setError(result.success ? '更新 Skill 失败' : result.error); return; }
			setDeferredModes(result.data.deferredModes);
			await refresh();
		} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
		finally { setBusy(false); }
	};

	return <div className={styles.panel}>
		<header className={styles.panelHeader}>
			<div><p className={styles.eyebrow}>Capability registry</p><h3>Skill 工作台</h3><p>控制哪些专业指令进入不同模式。项目级 Skill 不由此页面管理，仍按项目规则加载。</p></div>
			<Button type="button" variant="outline" size="icon-sm" onClick={() => void refresh()} disabled={loading || busy} aria-label="重新扫描 Skill" title="重新扫描 Skill"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
		</header>
		<div className={styles.toolbar}>
			<label className={styles.searchBox}><Search size={14} aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、描述或路径" aria-label="搜索 Skill" /></label>
			<div className={styles.filterTabs} role="tablist" aria-label="Skill 来源筛选">{([['all', '全部'], ['builtin', '内置'], ['personal', '个人']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={source === value} className={source === value ? styles.filterTabActive : ''} onClick={() => setSource(value)}>{label}</button>)}</div>
		</div>
		{deferredModes.length > 0 && <div className={styles.notice}><RefreshCw size={14} /><span>{deferredModes.map((mode) => mode.toUpperCase()).join('、')} 当前有运行中的任务，配置将在任务完成后生效。</span></div>}
		{error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><AlertTriangle size={14} /><span>{error}</span></div>}
		{diagnostics.length > 0 && <div className={`${styles.notice} ${styles.noticeWarning}`} role="status"><AlertTriangle size={14} /><div><span>扫描发现 {diagnostics.length} 条提示，仍可管理已识别的 Skill。</span><ul className={styles.diagnosticList}>{diagnostics.slice(0, 3).map((diagnostic, index) => <li key={`${diagnostic.path ?? 'diagnostic'}-${index}`}>{diagnostic.message}{diagnostic.path ? ` · ${diagnostic.path}` : ''}</li>)}</ul>{diagnostics.length > 3 && <small>其余诊断已折叠。</small>}</div></div>}
		<div className={`${styles.list} gp-scrollbar`}>
			{loading ? <div className={styles.empty}><RefreshCw className="animate-spin" size={18} /><span>正在扫描用户级 Skill…</span></div> : filtered.length === 0 ? <div className={styles.empty}><Sparkles size={20} /><span>{skills.length === 0 ? '尚未发现用户级 Skill。' : '没有匹配的 Skill。'}</span></div> : <>
				{builtin.length > 0 && <section className={styles.group}><div className={styles.groupHeading}><span>内置 Skill</span><small>{builtin.length}</small></div>{builtin.map((skill) => <SkillRow key={skill.id} skill={skill} busy={busy} onEnabled={(enabled) => void mutate(() => rpc.skillSetEnabled(skill.name, enabled))} onModes={(modes) => void mutate(() => rpc.skillSetModes(skill.name, modes))} />)}</section>}
				{personal.length > 0 && <section className={styles.group}><div className={styles.groupHeading}><span>个人 Skill</span><small>{personal.length}</small></div>{personal.map((skill) => <SkillRow key={skill.id} skill={skill} busy={busy} onEnabled={(enabled) => void mutate(() => rpc.skillSetEnabled(skill.name, enabled))} onModes={(modes) => void mutate(() => rpc.skillSetModes(skill.name, modes))} />)}</section>}
			</>}
		</div>
	</div>;
}
