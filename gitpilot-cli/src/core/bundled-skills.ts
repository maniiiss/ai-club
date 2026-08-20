/** GitPilot 随安装包分发的 Skill 安装逻辑。 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { getBundledSkillsDir } from "../config.ts";

const BUNDLED_SKILL_REGISTRY_FILE = "bundled-skills.json";

/** 内置 Skill 的默认产品模式；用户仍可在 Desktop 设置页中自行调整。 */
export type BundledSkillMode = "code" | "work" | "design";

interface BundledSkillDefinition {
	name: string;
	defaultModes: BundledSkillMode[];
}

/**
 * 随 GitPilot 发布的通用 Skill。
 *
 * Office 三件套只默认进入 Work：它们会调用受限的本地文档工具，不应挤占
 * Code/Design 模式的常规上下文；用户仍可从 Skill 工作台将其分配到其他模式。
 * gitnexus 只默认进入 Code：它指导模型用 GitNexus MCP 知识图谱做代码理解、
 * 影响分析与重构护航，对 Work/Design 模式没有意义。
 */
const BUNDLED_SKILLS: readonly BundledSkillDefinition[] = [
	{ name: "cross-agent-harness", defaultModes: ["code"] },
	{ name: "gitnexus", defaultModes: ["code"] },
	{ name: "office-docx", defaultModes: ["work"] },
	{ name: "office-xlsx", defaultModes: ["work"] },
	{ name: "office-pptx", defaultModes: ["work"] },
];

export interface BundledSkillRegistryEntry {
	path: string;
	sourceHash: string;
	/** 首次发现且用户尚未配置范围时使用的推荐模式。 */
	defaultModes?: BundledSkillMode[];
}

export interface BundledSkillRegistry {
	version: 1;
	skills: Record<string, BundledSkillRegistryEntry>;
}

const emptyBundledSkillRegistry = (): BundledSkillRegistry => ({ version: 1, skills: {} });

function bundledSkillRegistryPath(agentDir: string): string {
	return join(agentDir, BUNDLED_SKILL_REGISTRY_FILE);
}

function skillSourceHash(path: string): string {
	return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex");
}

function normalizeBundledSkillModes(value: unknown): BundledSkillMode[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const modes = [...new Set(value.filter((mode): mode is BundledSkillMode => mode === "code" || mode === "work" || mode === "design"))];
	return modes.length > 0 ? modes : undefined;
}

function readBundledSkillRegistry(agentDir: string): BundledSkillRegistry {
	try {
		const parsed = JSON.parse(readFileSync(bundledSkillRegistryPath(agentDir), "utf8")) as Partial<BundledSkillRegistry>;
		if (!parsed || parsed.version !== 1 || !parsed.skills || typeof parsed.skills !== "object") return emptyBundledSkillRegistry();
		const skills: Record<string, BundledSkillRegistryEntry> = {};
		for (const [name, value] of Object.entries(parsed.skills)) {
			if (!value || typeof value !== "object" || typeof value.path !== "string" || typeof value.sourceHash !== "string") continue;
			const defaultModes = normalizeBundledSkillModes(value.defaultModes);
			skills[name] = { path: value.path, sourceHash: value.sourceHash, ...(defaultModes ? { defaultModes } : {}) };
		}
		return { version: 1, skills };
	} catch {
		return emptyBundledSkillRegistry();
	}
}

function writeBundledSkillRegistry(agentDir: string, registry: BundledSkillRegistry): void {
	mkdirSync(agentDir, { recursive: true });
	const target = bundledSkillRegistryPath(agentDir);
	const temporary = `${target}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
	renameSync(temporary, target);
}

/** 供 Skill 管理器识别安装包内置 Skill；只返回已登记且仍存在的路径。 */
export function getBundledSkillRegistry(agentDir: string): BundledSkillRegistry {
	const registry = readBundledSkillRegistry(agentDir);
	const skills: Record<string, BundledSkillRegistryEntry> = {};
	for (const [name, entry] of Object.entries(registry.skills)) {
		if (existsSync(join(entry.path, "SKILL.md"))) skills[name] = entry;
	}
	return { version: 1, skills };
}

export interface BundledSkillInstallResult {
	installedSkillNames: string[];
}

interface FrameworkProfileLike {
	familyId: string;
	status: string;
	adapterId?: string;
	version?: string;
}

/**
 * 首次启动将平台内置 Skill 安装到 GitPilot 自己的用户级目录。
 * 已存在的同名且内容不同的 Skill 视为用户自定义内容，绝不覆盖；内容一致的旧安装仅补登记来源。
 */
export function installBundledSkills(agentDir: string): BundledSkillInstallResult {
	const registry = readBundledSkillRegistry(agentDir);
	const installedSkillNames: string[] = [];
	for (const skill of BUNDLED_SKILLS) {
		const sourcePath = join(getBundledSkillsDir(), skill.name);
		const targetPath = join(agentDir, "skills", skill.name);
		if (!existsSync(join(sourcePath, "SKILL.md"))) {
			throw new Error(`内置 Skill 资源缺失：${sourcePath}`);
		}

		const sourceHash = skillSourceHash(join(sourcePath, "SKILL.md"));
		let installed = false;
		if (!existsSync(targetPath)) {
			mkdirSync(dirname(targetPath), { recursive: true });
			cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
			installed = true;
		} else if (!registry.skills[skill.name]) {
			// 兼容旧版本：只有内容仍与发布包一致时才迁移为内置来源，避免误标同名个人 Skill。
			try {
				if (skillSourceHash(join(targetPath, "SKILL.md")) !== sourceHash) continue;
			} catch {
				continue;
			}
		}

		registry.skills[skill.name] = { path: targetPath, sourceHash, defaultModes: [...skill.defaultModes] };
		if (installed) installedSkillNames.push(skill.name);
	}
	writeBundledSkillRegistry(agentDir, registry);
	return { installedSkillNames };
}

/**
 * 将识别到的框架 Skill 安装到项目级目录。
 * 业务意图：框架规则只跟随识别到的项目生效，并且永远不覆盖用户已有的同名 Skill。
 */
export function installProjectFrameworkSkills(workspaceRoot: string, profiles: readonly FrameworkProfileLike[]): string[] {
	const installed: string[] = [];
	const familyToSkill: Record<string, string> = { kuaikai: "kuaikai-platform" };
	for (const profile of profiles) {
		if (profile.status !== "detected") continue;
		// 版本未确认时只注入公共提示词，不能把 1.0 Skill 当成未知版本的事实。
		if (!profile.adapterId || !profile.version || profile.version === "unknown") continue;
		const skillName = familyToSkill[profile.familyId];
		if (!skillName) continue;
		const sourcePath = join(getBundledSkillsDir(), skillName);
		const targetPath = join(workspaceRoot, ".gitpilot", "skills", skillName);
		if (existsSync(targetPath) || !existsSync(join(sourcePath, "SKILL.md"))) continue;
		mkdirSync(dirname(targetPath), { recursive: true });
		cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
		installed.push(skillName);
	}
	return installed;
}
