import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { filterSkillsForMode, listManagedSkills, readSkillScopes, setManagedSkillEnabled, setManagedSkillModes } from "../src/extensions/gitpilot/skill-manager.ts";

describe("GitPilot Skill 管理", () => {
	let root: string;
	let agentDir: string;
	let agentsSkillsDir: string;
	const options = () => ({ userAgentsSkillsDir: agentsSkillsDir });

	beforeEach(() => {
		root = join(tmpdir(), `gitpilot-skill-manager-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(root, "agent");
		agentsSkillsDir = join(root, "agents", "skills");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	function writeSkill(rootDir: string, name: string, description = "测试 Skill"): string {
		const directory = join(rootDir, name);
		mkdirSync(directory, { recursive: true });
		const filePath = join(directory, "SKILL.md");
		writeFileSync(filePath, `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`, "utf8");
		return filePath;
	}

	it("发现 GitPilot 与 ~/.agents 两个用户级目录，默认只用于 CODE", () => {
		writeSkill(join(agentDir, "skills"), "local-skill");
		writeSkill(agentsSkillsDir, "agents-skill");

		const result = listManagedSkills(agentDir, options());
		expect(result.skills.map((skill) => skill.name)).toEqual(["agents-skill", "local-skill"]);
		expect(result.skills.every((skill) => skill.enabled && skill.modes.join(",") === "code")).toBe(true);
		expect(result.skills.every((skill) => skill.source === "personal")).toBe(true);
	});

	it("内置 Office Skill 使用注册表默认的 WORK 范围，且可由用户显式改写", () => {
		const builtinFile = writeSkill(join(agentDir, "skills"), "office-docx");
		writeFileSync(join(agentDir, "bundled-skills.json"), JSON.stringify({ version: 1, skills: { "office-docx": { path: dirname(builtinFile), sourceHash: "test", defaultModes: ["work"] } } }), "utf8");

		const initial = listManagedSkills(agentDir, options()).skills[0];
		expect(initial?.source).toBe("builtin");
		expect(initial?.modes).toEqual(["work"]);
		setManagedSkillModes(agentDir, "office-docx", ["code", "design"], options());
		expect(listManagedSkills(agentDir, options()).skills[0]?.modes).toEqual(["code", "design"]);
	});

	it("登记路径对应 SKILL.md 时正确标记内置来源", () => {
		const builtinFile = writeSkill(join(agentDir, "skills"), "cross-agent-harness");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "bundled-skills.json"), JSON.stringify({ version: 1, skills: { "cross-agent-harness": { path: dirname(builtinFile), sourceHash: "test" } } }), "utf8");
		expect(listManagedSkills(agentDir, options()).skills[0]?.source).toBe("builtin");
	});

	it("同名 Skill 只保留优先的 GitPilot 用户目录条目并报告冲突", () => {
		writeSkill(join(agentDir, "skills"), "same-name", "GitPilot 目录版本");
		writeSkill(agentsSkillsDir, "same-name", "Agents 目录版本");

		const result = listManagedSkills(agentDir, options());
		expect(result.skills).toHaveLength(1);
		expect(result.skills[0]?.description).toBe("GitPilot 目录版本");
		expect(result.diagnostics.some((diagnostic) => diagnostic.type === "collision")).toBe(true);
	});

	it("持久化启停与模式选择，拒绝空模式", () => {
		writeSkill(join(agentDir, "skills"), "managed-skill");
		setManagedSkillEnabled(agentDir, "managed-skill", false, options());
		setManagedSkillModes(agentDir, "managed-skill", ["work", "design"], options());

		expect(readSkillScopes(agentDir).skills["managed-skill"]).toEqual({ enabled: false, modes: ["work", "design"] });
		expect(() => setManagedSkillModes(agentDir, "managed-skill", [], options())).toThrow("至少需要选择一个");
	});

	it("按 CODE、WORK、DESIGN 模式分别过滤用户 Skill", () => {
		const filePath = writeSkill(join(agentDir, "skills"), "work-only");
		setManagedSkillModes(agentDir, "work-only", ["work"], options());
		const skill: Skill = {
			name: "work-only",
			description: "工作模式 Skill",
			filePath,
			baseDir: dirname(filePath),
			disableModelInvocation: false,
			sourceInfo: createSyntheticSourceInfo(filePath, { source: "local", scope: "user" }),
		};

		expect(filterSkillsForMode({ skills: [skill], diagnostics: [] }, "code", agentDir, options()).skills).toEqual([]);
		expect(filterSkillsForMode({ skills: [skill], diagnostics: [] }, "work", agentDir, options()).skills).toEqual([skill]);
		expect(filterSkillsForMode({ skills: [skill], diagnostics: [] }, "design", agentDir, options()).skills).toEqual([]);
	});

	it("损坏配置回退为安全默认值", () => {
		writeFileSync(join(agentDir, "skill-scopes.json"), "{坏 JSON", "utf8");
		expect(readSkillScopes(agentDir)).toEqual({ version: 1, skills: {} });
	});

	it("未知或空模式配置回退为 CODE 默认值", () => {
		writeSkill(join(agentDir, "skills"), "invalid-modes");
		writeFileSync(join(agentDir, "skill-scopes.json"), JSON.stringify({ version: 1, skills: { "invalid-modes": { enabled: true, modes: ["unknown"] } } }), "utf8");
		expect(listManagedSkills(agentDir, options()).skills[0]?.modes).toEqual(["code"]);
	});

	it("仅过滤受控的用户级 Skill，项目 Skill 始终保持原有加载行为", () => {
		const userFile = writeSkill(join(agentDir, "skills"), "user-skill");
		const projectFile = join(root, "project", ".gitpilot", "skills", "project-skill", "SKILL.md");
		mkdirSync(dirname(projectFile), { recursive: true });
		writeFileSync(projectFile, "---\nname: project-skill\ndescription: 项目 Skill\n---", "utf8");
		setManagedSkillEnabled(agentDir, "user-skill", false, options());
		const createSkill = (name: string, filePath: string): Skill => ({ name, description: name, filePath, baseDir: dirname(filePath), disableModelInvocation: false, sourceInfo: createSyntheticSourceInfo(filePath, { source: "local", scope: "user" }) });

		const result = filterSkillsForMode({ skills: [createSkill("user-skill", userFile), createSkill("project-skill", projectFile)], diagnostics: [] }, "code", agentDir, options());
		expect(result.skills.map((skill) => skill.name)).toEqual(["project-skill"]);
	});

	it("临时显式 Skill 路径不受用户级开关过滤", () => {
		const userFile = writeSkill(join(agentDir, "skills"), "explicit-skill");
		setManagedSkillEnabled(agentDir, "explicit-skill", false, options());
		const skill: Skill = {
			name: "explicit-skill",
			description: "显式 Skill",
			filePath: userFile,
			baseDir: dirname(userFile),
			disableModelInvocation: false,
			sourceInfo: createSyntheticSourceInfo(userFile, { source: "local", scope: "user" }),
		};

		const result = filterSkillsForMode({ skills: [skill], diagnostics: [] }, "code", agentDir, { ...options(), explicitSkillPaths: [userFile] });
		expect(result.skills).toEqual([skill]);
	});
});
