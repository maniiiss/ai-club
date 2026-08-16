/** GitPilot 随安装包分发的 Skill 安装逻辑。 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getBundledSkillsDir } from "../config.ts";

const CROSS_AGENT_HARNESS_SKILL = "cross-agent-harness";

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
 * 已存在的同名 Skill 视为用户自定义内容，绝不覆盖，保持用户对本地技能的控制权。
 */
export function installBundledSkills(agentDir: string): BundledSkillInstallResult {
	const sourcePath = join(getBundledSkillsDir(), CROSS_AGENT_HARNESS_SKILL);
	const targetPath = join(agentDir, "skills", CROSS_AGENT_HARNESS_SKILL);
	if (existsSync(targetPath)) return { installedSkillNames: [] };
	if (!existsSync(join(sourcePath, "SKILL.md"))) {
		throw new Error(`内置 Skill 资源缺失：${sourcePath}`);
	}

	mkdirSync(dirname(targetPath), { recursive: true });
	cpSync(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
	return { installedSkillNames: [CROSS_AGENT_HARNESS_SKILL] };
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
