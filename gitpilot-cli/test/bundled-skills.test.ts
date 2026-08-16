import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installBundledSkills, installProjectFrameworkSkills } from "../src/core/bundled-skills.ts";

describe("GitPilot 内置 Skill", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	function createAgentDir(): string {
		const agentDir = join(tmpdir(), `gitpilot-bundled-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		temporaryDirectories.push(agentDir);
		return agentDir;
	}

	it("首次创建服务时安装完整的跨智能体 Harness Skill 包", () => {
		const agentDir = createAgentDir();

		expect(installBundledSkills(agentDir)).toEqual({ installedSkillNames: ["cross-agent-harness"] });
		const skillDir = join(agentDir, "skills", "cross-agent-harness");
		expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toContain("name: cross-agent-harness");
		expect(existsSync(join(skillDir, "references", "usage.md"))).toBe(true);
		expect(existsSync(join(skillDir, "assets", "template", "scripts", "validate_harness.py"))).toBe(true);
	});

	it("不覆盖用户已有的同名 Skill", () => {
		const agentDir = createAgentDir();
		const skillPath = join(agentDir, "skills", "cross-agent-harness", "SKILL.md");
		mkdirSync(dirname(skillPath), { recursive: true });
		writeFileSync(skillPath, "用户自定义内容", { encoding: "utf8", flag: "w" });

		expect(installBundledSkills(agentDir)).toEqual({ installedSkillNames: [] });
		expect(readFileSync(skillPath, "utf8")).toBe("用户自定义内容");
	});

	it("识别到快开后只在项目级安装快开 Skill", () => {
		const workspaceRoot = createAgentDir();

		expect(installProjectFrameworkSkills(workspaceRoot, [{ familyId: "kuaikai", adapterId: "kuaikai-v1", version: "1.0", status: "detected" }])).toEqual(["kuaikai-platform"]);
		const skillPath = join(workspaceRoot, ".gitpilot", "skills", "kuaikai-platform", "SKILL.md");
		expect(readFileSync(skillPath, "utf8")).toContain("name: kuaikai-platform");
		expect(installProjectFrameworkSkills(workspaceRoot, [{ familyId: "kuaikai", adapterId: "kuaikai-v1", version: "1.0", status: "detected" }])).toEqual([]);
	});

	it("版本未知时不安装版本特有 Skill", () => {
		const workspaceRoot = createAgentDir();

		expect(installProjectFrameworkSkills(workspaceRoot, [{ familyId: "kuaikai", adapterId: "kuaikai-v1", version: "unknown", status: "detected" }])).toEqual([]);
		expect(existsSync(join(workspaceRoot, ".gitpilot", "skills", "kuaikai-platform"))).toBe(false);
	});
});
