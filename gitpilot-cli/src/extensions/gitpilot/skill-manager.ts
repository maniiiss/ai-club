/**
 * GitPilot 用户级 Skill 管理。
 *
 * 业务意图：只管理用户级标准目录中的 Skill；项目 Skill 继续由项目可信度和
 * ResourceLoader 原有规则决定，避免设置页意外改写团队仓库行为。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getBundledSkillRegistry } from "../../core/bundled-skills.ts";
import { canonicalizePath } from "../../utils/paths.ts";
import { loadSkillsFromDir, type Skill } from "../../core/skills.ts";
import type { ResourceDiagnostic } from "../../core/diagnostics.ts";

export type SkillMode = "code" | "work" | "design";
export const SKILL_MODES: readonly SkillMode[] = ["code", "work", "design"];

export interface SkillScopeSetting {
	enabled: boolean;
	modes: SkillMode[];
}

export interface SkillScopesFile {
	version: 1;
	skills: Record<string, SkillScopeSetting>;
}

export interface ManagedSkill {
	id: string;
	name: string;
	description: string;
	source: "builtin" | "personal";
	filePath: string;
	enabled: boolean;
	modes: SkillMode[];
	disableModelInvocation: boolean;
}

export interface ManagedSkillDiagnostic {
	type: ResourceDiagnostic["type"] | "collision";
	message: string;
	path?: string;
}

export interface SkillManagerOptions {
	/** 测试或嵌入式宿主可替换 ~/.agents/skills；生产环境使用标准目录。 */
	userAgentsSkillsDir?: string;
	/** 临时显式传入的 Skill 路径不受用户级开关过滤。 */
	explicitSkillPaths?: string[];
}

const DEFAULT_SKILL_SCOPE: SkillScopeSetting = { enabled: true, modes: ["code"] };

/**
 * 内置 Skill 可以声明首次安装时的推荐模式；一旦用户在设置页保存过范围，
 * `skill-scopes.json` 的显式选择永远优先，避免升级后悄悄改写个人工作流。
 */
function defaultScopeForSkill(agentDir: string, name: string): SkillScopeSetting {
	const modes = getBundledSkillRegistry(agentDir).skills[name]?.defaultModes;
	return modes?.length ? { enabled: true, modes: [...modes] } : { enabled: true, modes: [...DEFAULT_SKILL_SCOPE.modes] };
}

function scopesPath(agentDir: string): string {
	return join(agentDir, "skill-scopes.json");
}

function emptyScopes(): SkillScopesFile {
	return { version: 1, skills: {} };
}

function normalizeModes(value: unknown): SkillMode[] {
	if (!Array.isArray(value)) return ["code"];
	return [...new Set(value.filter((mode): mode is SkillMode => SKILL_MODES.includes(mode as SkillMode)))];
}

function normalizeScope(value: unknown): SkillScopeSetting {
	if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SKILL_SCOPE };
	const input = value as Partial<SkillScopeSetting>;
	const modes = normalizeModes(input.modes);
	return {
		enabled: input.enabled !== false,
		// 配置文件手工损坏或只包含未知模式时回退到安全的 CODE 默认值。
		modes: modes.length > 0 ? modes : [...DEFAULT_SKILL_SCOPE.modes],
	};
}

export function readSkillScopes(agentDir: string): SkillScopesFile {
	try {
		const parsed = JSON.parse(readFileSync(scopesPath(agentDir), "utf8")) as Partial<SkillScopesFile>;
		if (!parsed || parsed.version !== 1 || !parsed.skills || typeof parsed.skills !== "object") return emptyScopes();
		const skills: Record<string, SkillScopeSetting> = {};
		for (const [name, value] of Object.entries(parsed.skills)) skills[name] = normalizeScope(value);
		return { version: 1, skills };
	} catch {
		return emptyScopes();
	}
}

function writeSkillScopes(agentDir: string, scopes: SkillScopesFile): void {
	mkdirSync(agentDir, { recursive: true });
	const target = scopesPath(agentDir);
	const temporary = `${target}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(scopes, null, 2)}\n`, "utf8");
	renameSync(temporary, target);
}

function userSkillRoots(agentDir: string, options?: SkillManagerOptions): string[] {
	return [
		join(resolve(agentDir), "skills"),
		options?.userAgentsSkillsDir ?? join(process.env.HOME || homedir(), ".agents", "skills"),
	];
}

function isUnderPath(target: string, root: string): boolean {
	const normalizedTarget = resolve(target);
	const normalizedRoot = resolve(root);
	return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

function isExplicitSkillPath(filePath: string, explicitPaths: readonly string[]): boolean {
	const target = canonicalizePath(filePath);
	return explicitPaths.some((rawPath) => {
		const path = canonicalizePath(resolve(rawPath));
		return target === path || isUnderPath(target, path);
	});
}

function discoverUserSkills(agentDir: string, options?: SkillManagerOptions): { skills: Skill[]; diagnostics: ManagedSkillDiagnostic[] } {
	const skills: Skill[] = [];
	const diagnostics: ManagedSkillDiagnostic[] = [];
	const names = new Set<string>();
	const paths = new Set<string>();
	for (const root of userSkillRoots(agentDir, options)) {
		const result = loadSkillsFromDir({ dir: root, source: "user" });
		for (const diagnostic of result.diagnostics) diagnostics.push(diagnostic);
		for (const skill of result.skills) {
			const realPath = canonicalizePath(skill.filePath);
			if (paths.has(realPath)) continue;
			paths.add(realPath);
			if (names.has(skill.name)) {
				diagnostics.push({ type: "collision", message: `Skill 名称冲突：${skill.name}`, path: skill.filePath });
				continue;
			}
			names.add(skill.name);
			skills.push(skill);
		}
	}
	return { skills, diagnostics };
}

function sourceForSkill(skill: Skill, agentDir: string): ManagedSkill["source"] {
	const registry = getBundledSkillRegistry(agentDir);
	const entry = registry.skills[skill.name];
	return entry && canonicalizePath(join(entry.path, "SKILL.md")) === canonicalizePath(skill.filePath)
		? "builtin"
		: "personal";
}

function managedSkillFromSkill(skill: Skill, scope: SkillScopeSetting, agentDir: string): ManagedSkill {
	return {
		id: skill.name,
		name: skill.name,
		description: skill.description,
		source: sourceForSkill(skill, agentDir),
		filePath: skill.filePath,
		enabled: scope.enabled,
		modes: [...scope.modes],
		disableModelInvocation: skill.disableModelInvocation,
	};
}

export function listManagedSkills(agentDir: string, options?: SkillManagerOptions): { skills: ManagedSkill[]; diagnostics: ManagedSkillDiagnostic[] } {
	const discovered = discoverUserSkills(agentDir, options);
	const scopes = readSkillScopes(agentDir);
	return {
		skills: discovered.skills
			.map((skill) => managedSkillFromSkill(skill, scopes.skills[skill.name] ?? defaultScopeForSkill(agentDir, skill.name), agentDir))
			.sort((left, right) => left.source.localeCompare(right.source) || left.name.localeCompare(right.name)),
		diagnostics: discovered.diagnostics,
	};
}

function assertManagedSkill(agentDir: string, name: string, options?: SkillManagerOptions): void {
	if (!listManagedSkills(agentDir, options).skills.some((skill) => skill.name === name)) throw new Error(`用户级 Skill 不存在：${name}`);
}

export function setManagedSkillEnabled(agentDir: string, name: string, enabled: boolean, options?: SkillManagerOptions): void {
	assertManagedSkill(agentDir, name, options);
	const scopes = readSkillScopes(agentDir);
	const current = scopes.skills[name] ?? defaultScopeForSkill(agentDir, name);
	scopes.skills[name] = { ...current, enabled: Boolean(enabled) };
	writeSkillScopes(agentDir, scopes);
}

export function setManagedSkillModes(agentDir: string, name: string, modes: SkillMode[], options?: SkillManagerOptions): void {
	assertManagedSkill(agentDir, name, options);
	const normalized = normalizeModes(modes);
	if (normalized.length === 0) throw new Error("Skill 至少需要选择一个工作模式");
	const scopes = readSkillScopes(agentDir);
	const current = scopes.skills[name] ?? defaultScopeForSkill(agentDir, name);
	scopes.skills[name] = { ...current, modes: normalized };
	writeSkillScopes(agentDir, scopes);
}

export function filterSkillsForMode(
	base: { skills: Skill[]; diagnostics: ResourceDiagnostic[] },
	mode: SkillMode,
	agentDir: string,
	options?: SkillManagerOptions,
): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
	const scopes = readSkillScopes(agentDir);
	const roots = userSkillRoots(agentDir, options);
	return {
		skills: base.skills.filter((skill) => {
			const path = skill.filePath;
			if (isExplicitSkillPath(path, options?.explicitSkillPaths ?? [])) return true;
			if (!roots.some((root) => isUnderPath(path, root))) return true;
			const scope = scopes.skills[skill.name] ?? defaultScopeForSkill(agentDir, skill.name);
			return scope.enabled && scope.modes.includes(mode);
		}),
		diagnostics: base.diagnostics,
	};
}
