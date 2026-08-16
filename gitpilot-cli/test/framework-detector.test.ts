import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectFrameworks } from "../src/extensions/gitpilot/framework-detector.ts";
import { formatFrameworkProfilesPrompt, formatTechnologyStack, sanitizeFrameworkProfiles } from "../src/extensions/gitpilot/framework-profile.ts";
import { frameworkProfileFilePath, refreshFrameworkProfiles } from "../src/extensions/gitpilot/project-binding.ts";

describe("快开框架识别器", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
	});

	async function createWorkspace(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "gitpilot-kuaikai-"));
		temporaryDirectories.push(root);
		return root;
	}

	it("根据 Maven、skzz、业务 API 和 Groovy 模型脚本识别快开", async () => {
		const root = await createWorkspace();
		await mkdir(join(root, "backend", "scripts", "model", "order"), { recursive: true });
		await mkdir(join(root, "backend", "src"), { recursive: true });
		await mkdir(join(root, "frontend", "src"), { recursive: true });
		await writeFile(join(root, "backend", "pom.xml"), `
<dependency>
  <groupId>com.zz.platform</groupId>
  <artifactId>zz-platform-file-starter</artifactId>
  <version>1.0.3</version>
</dependency>
<artifactId>spring-boot-starter-web</artifactId>
<artifactId>mybatis-spring-boot-starter</artifactId>
`, "utf8");
		await writeFile(join(root, "backend", "src", "OrderService.java"), "class OrderService {}", "utf8");
		await writeFile(join(root, "frontend", "package.json"), JSON.stringify({ dependencies: { "@vunk/skzz": "1.0.8" } }), "utf8");
		await writeFile(join(root, "frontend", "src", "order.ts"), `
import { useBusiService, useFlowService } from '@vunk/skzz'
const service = useBusiService()
const flow = useFlowService()
fetch('/core/busi/query')
`, "utf8");
		await writeFile(join(root, "backend", "scripts", "model", "order", "save.groovy"), `
def argument = argument()
def dbTool = sqlTool()
dbTool.query("select * from b_order where id=?", argument.condition.id)
`, "utf8");

		const result = await detectFrameworks(root);
		expect(result.partial).toBe(false);
		expect(result.technologyStack).toEqual(expect.arrayContaining(["Java", "Spring Boot", "MyBatis"]));
		expect(result.profiles).toHaveLength(1);
		const profile = result.profiles[0];
		expect(profile.familyId).toBe("kuaikai");
		expect(profile.adapterId).toBe("kuaikai-v1");
		expect(profile.version).toBe("1.0");
		expect(profile.status).toBe("detected");
		expect(profile.modules).toContain("busi-data");
		expect(profile.components).toEqual(expect.arrayContaining(["java-backend", "vue-frontend"]));
		expect(profile.evidence.some((item) => item.rule === "maven-com-zz-platform")).toBe(true);
	});

	it("不会仅凭 README 或目录名误识别", async () => {
		const root = await createWorkspace();
		await mkdir(join(root, "kuaikai-project"), { recursive: true });
		await writeFile(join(root, "README.md"), "本项目使用快开、useBusiService、zz_model_flow", "utf8");
		const result = await detectFrameworks(root);
		expect(result.profiles).toHaveLength(0);
	});

	it("解析 Maven 属性、父 POM 和 dependencyManagement 中的快开版本", async () => {
		const root = await createWorkspace();
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(join(root, "pom.xml"), `
<project>
  <properties>
    <zz.platform.version>1.0.7</zz.platform.version>
  </properties>
  <parent>
    <groupId>com.zz.platform</groupId>
    <artifactId>zz-platform-parent</artifactId>
    <version>\${zz.platform.version}</version>
  </parent>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>com.zz.platform</groupId>
        <artifactId>zz-platform-bom</artifactId>
        <version>\${zz.platform.version}</version>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.zz.platform</groupId>
      <artifactId>zz-platform-file-starter</artifactId>
    </dependency>
  </dependencies>
</project>
`, "utf8");
		await writeFile(join(root, "src", "platform.ts"), "useBusiService(); fetch('/core/busi/query')", "utf8");

		const result = await detectFrameworks(root);
		const profile = result.profiles[0];
		expect(profile?.version).toBe("1.0");
		expect(profile?.versionSource).toBe("maven-parent");
		expect(profile?.evidence.some((item) => item.rule === "maven-parent-version")).toBe(true);
		expect(profile?.evidence.some((item) => /^version-maven-(?:bom|managed-version|property)$/.test(item.rule))).toBe(true);
	});

	it("解析 Gradle 坐标和版本变量", async () => {
		const root = await createWorkspace();
		await writeFile(join(root, "gradle.properties"), "zzPlatformVersion=1.0.4\n", "utf8");
		await writeFile(join(root, "build.gradle"), `
ext {
  zzPlatformVersion = '1.0.4'
}
dependencies {
  implementation "com.zz.platform:zz-platform-file-starter:\${zzPlatformVersion}"
}
`, "utf8");
		await writeFile(join(root, "Platform.ts"), "useBusiService(); fetch('/core/busi/query')", "utf8");

		const result = await detectFrameworks(root);
		expect(result.profiles[0]?.version).toBe("1.0");
		expect(result.profiles[0]?.versionSource).toBe("gradle-coordinate");
		expect(result.profiles[0]?.evidence.some((item) => item.rule === "gradle-kuaikai-coordinate")).toBe(true);
	});

	it("从 npm lockfile 解析 workspace 依赖的实际版本", async () => {
		const root = await createWorkspace();
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@vunk/skzz": "workspace:*" } }), "utf8");
		await writeFile(join(root, "package-lock.json"), JSON.stringify({
			packages: {
				"": { dependencies: { "@vunk/skzz": "workspace:*" } },
				"node_modules/@vunk/skzz": { version: "1.0.9" },
			},
		}), "utf8");
		await writeFile(join(root, "src", "index.ts"), "useBusiService(); fetch('/core/busi/query')", "utf8");

		const result = await detectFrameworks(root);
		expect(result.profiles[0]?.version).toBe("1.0");
		expect(result.profiles[0]?.versionSource).toBe("npm-lockfile");
		expect(result.profiles[0]?.evidence.some((item) => item.rule === "npm-kuaikai-lockfile")).toBe(true);
	});

	it("已有未知版本证据时不静默套用 kuaikai-v1", async () => {
		const root = await createWorkspace();
		await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@vunk/skzz": "2.0.0" } }), "utf8");
		await writeFile(join(root, "src.ts"), "useBusiService(); fetch('/core/busi/query')", "utf8");

		const result = await detectFrameworks(root);
		expect(result.profiles[0]?.version).toBe("unknown");
		expect(result.profiles[0]?.versionSource).toBe("unsupported-version");
		expect(result.profiles[0]?.adapterId).toBeUndefined();
		expect(result.profiles[0]?.status).toBe("ambiguous");
	});

	it("没有版本证据时只保留框架族公共识别", async () => {
		const root = await createWorkspace();
		await writeFile(join(root, "pom.xml"), "<groupId>com.zz.platform</groupId><artifactId>zz-platform-file-starter</artifactId>", "utf8");
		await writeFile(join(root, "src.ts"), "useBusiService(); fetch('/core/busi/query')", "utf8");

		const result = await detectFrameworks(root);
		expect(result.profiles[0]?.version).toBe("unknown");
		expect(result.profiles[0]?.versionSource).toBe("no-version-evidence");
		expect(result.profiles[0]?.adapterId).toBeUndefined();
		expect(result.profiles[0]?.codingGuidance).toEqual([]);
	});

	it("档案摘要保留版本未知状态并过滤敏感字段", () => {
		const profiles = sanitizeFrameworkProfiles([{
			profileSchemaVersion: 1,
			familyId: "kuaikai",
			adapterId: "kuaikai-v1",
			name: "快开",
			version: "unknown",
			status: "detected",
			confidence: 0.8,
			scope: "workspace",
			components: ["java-backend"],
			modules: ["busi-data"],
			evidence: [{ path: "application.yml", rule: "secret", matched: "accessKey=real-value", weight: 0.1 }],
			codingGuidance: ["SQL 使用占位符"],
			ruleSetVersion: "kuaikai-v1-r1",
			fingerprint: "scan-1:test",
			detectedAt: "2026-08-15T00:00:00.000Z",
		}]);
		expect(formatTechnologyStack(profiles)).toBe("快开、Java 后端");
		const prompt = formatFrameworkProfilesPrompt(profiles);
		expect(prompt).toContain("版本未确认");
		expect(prompt).toContain("SQL 使用占位符");
		expect(prompt).not.toContain("real-value");
	});

	it("未绑定项目刷新时写入 profile 缓存并安装项目级 Skill", async () => {
		const root = await createWorkspace();
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@vunk/skzz": "1.0.8" } }), "utf8");
		await writeFile(join(root, "pom.xml"), "<groupId>com.zz.platform</groupId>", "utf8");
		await writeFile(join(root, "src", "service.ts"), "import { useBusiService } from '@vunk/skzz'\nuseBusiService()", "utf8");
		const result = await refreshFrameworkProfiles(root);
		expect(result.profiles[0]?.familyId).toBe("kuaikai");
		const cache = JSON.parse(await readFile(frameworkProfileFilePath(root), "utf8")) as { profiles: Array<{ familyId: string }> };
		expect(cache.profiles[0]?.familyId).toBe("kuaikai");
		expect(await readFile(join(root, ".gitpilot", "skills", "kuaikai-platform", "SKILL.md"), "utf8")).toContain("name: kuaikai-platform");
	});
});
