/**
 * GitPilot 平台对接 extension 的纯逻辑单测。
 * 覆盖平台地址规范化与模型会话缓存（含过期重建），通过 mock 全局 fetch 端到端验证真实 api 路径。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePlatformUrl } from "../src/extensions/gitpilot/config.ts";
import { getWorkItemDetail, getWorkItemLinks, listMyTasks, listProjects, uploadDesignVersion } from "../src/extensions/gitpilot/api.ts";
import { clearModelSessions, ensureModelSession } from "../src/extensions/gitpilot/session-cache.ts";

const PLATFORM_URL = "http://localhost:8080";
const MODEL_CONFIG_ID = 7;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const platformOk = (data: unknown) => ({
	ok: true,
	text: async () => JSON.stringify({ success: true, data }),
});

const sessionResponse = (sessionId: string, token: string, ttlMs: number) => ({
	sessionId,
	accessToken: token,
	expiresAt: new Date(Date.now() + ttlMs).toISOString(),
	provider: "OPENAI" as const,
	modelName: "gpt-test",
	proxyBaseUrl: `${PLATFORM_URL}/api/cli/model-sessions/${sessionId}`,
});

describe("normalizePlatformUrl", () => {
	it("去掉尾斜杠并保留 http/https", () => {
		expect(normalizePlatformUrl("https://gitpilot.example.com/")).toBe("https://gitpilot.example.com");
		expect(normalizePlatformUrl("http://localhost:8080//")).toBe("http://localhost:8080");
	});

	it("拒绝非 http(s) 与带凭据地址", () => {
		expect(() => normalizePlatformUrl("ftp://x")).toThrow();
		expect(() => normalizePlatformUrl("https://user:pass@host")).toThrow();
		expect(() => normalizePlatformUrl("   ")).toThrow();
	});
});

describe("ensureModelSession", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		clearModelSessions();
	});

	afterEach(() => {
		clearModelSessions();
	});

	it("命中缓存时不重复签发", async () => {
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s1", "gms_aaa", 14 * 60_000)));
		const first = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		const second = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(second.accessToken).toBe(first.accessToken);
		expect(second.proxyBaseUrl).toBe(`${PLATFORM_URL}/api/cli/model-sessions/s1`);
	});

	it("临近过期时自动重建会话", async () => {
		// 首次签发一个即将过期（30s）的会话
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s1", "gms_old", 30_000)));
		await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		// 再次获取时因临近过期（<60s 余量）应重新签发
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s2", "gms_new", 14 * 60_000)));
		const refreshed = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(refreshed.accessToken).toBe("gms_new");
		expect(refreshed.proxyBaseUrl).toBe(`${PLATFORM_URL}/api/cli/model-sessions/s2`);
	});
});

describe("listProjects", () => {
	it("通过 CLI 项目接口读取并按名称筛选项目", async () => {
		mockFetch.mockResolvedValueOnce(platformOk([
			{ id: 1, name: "订单中心", status: "进行中", description: "订单域" },
			{ id: 2, name: "知识库", status: "规划中", description: "知识域" },
		]));

		const projects = await listProjects(PLATFORM_URL, "gpt_test", "订单");

		expect(mockFetch).toHaveBeenCalledWith(
			`${PLATFORM_URL}/api/cli/projects`,
			expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer gpt_test" }) }),
		);
		expect(projects).toEqual([{ id: 1, name: "订单中心", status: "进行中", description: "订单域" }]);
	});
});

describe("uploadDesignVersion", () => {
	it("将指定本地修订作为草稿上传到 CLI 版本接口", async () => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce(platformOk({
			versionId: 42, versionNumber: 3, status: "DRAFT", projectId: 9,
			designId: "design-1", revisionId: "rev-3", createdAt: "2026-08-16T12:00:00Z",
		}));

		const result = await uploadDesignVersion(PLATFORM_URL, "gpt_test", {
			projectId: 9,
			designId: "design-1",
			revisionId: "rev-3",
			name: "登录页设计",
			summary: "调整登录流程",
			scene: { schemaVersion: 2, pages: [], nodes: {}, assets: {} },
			previewPng: "data:image/png;base64,aGVsbG8=",
		});

		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${PLATFORM_URL}/api/cli/projects/9/design-versions`);
		expect(options).toEqual(expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer gpt_test", "content-type": "application/json" }) }));
		expect(JSON.parse(String(options.body))).toMatchObject({ designId: "design-1", revisionId: "rev-3", previewPng: "data:image/png;base64,aGVsbG8=", scene: { schemaVersion: 2 } });
		expect(result).toMatchObject({ versionId: 42, versionNumber: 3, status: "DRAFT", revisionId: "rev-3" });
	});
});

// ============================================================================
// 工作项协同浏览（桌面端右侧栏分页浏览）依赖的三个查询接口
// ============================================================================

describe("listMyTasks", () => {
	it("分页与过滤参数映射为查询串并透传分页结构", async () => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce(platformOk({
			records: [
				{ id: 11, workItemCode: "REQ-11", name: "登录加固", workItemType: "需求", status: "进行中", priority: "高", assignee: "张三", taskType: null, projectId: 3, projectName: "订单中心", iterationId: null, iterationName: null, planStartDate: null, planEndDate: null, requirementMarkdown: "# 需求" },
			],
			total: 41,
			page: 2,
			size: 20,
			totalPages: 3,
		}));

		const page = await listMyTasks(PLATFORM_URL, "gpt_test", { page: 2, size: 20, status: "进行中", projectId: 3, keyword: "登录", workItemType: "需求" });

		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${PLATFORM_URL}/api/cli/tasks?page=2&size=20&status=${encodeURIComponent("进行中")}&projectId=3&keyword=${encodeURIComponent("登录")}&workItemType=${encodeURIComponent("需求")}`);
		expect(options).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer gpt_test" }) }));
		// 协同浏览的列表态依赖 requirementMarkdown 大字段留在记录里由调用方剔除，此处只验证结构透传。
		expect(page.total).toBe(41);
		expect(page.totalPages).toBe(3);
		expect(page.records[0]).toMatchObject({ id: 11, workItemCode: "REQ-11", requirementMarkdown: "# 需求" });
	});

	it("无过滤条件时不携带查询串", async () => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce(platformOk({ records: [], total: 0, page: 1, size: 20, totalPages: 0 }));

		await listMyTasks(PLATFORM_URL, "gpt_test");

		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${PLATFORM_URL}/api/cli/tasks`);
	});
});

describe("getWorkItemDetail", () => {
	it("按工作项 ID 读取业务详情接口", async () => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce(platformOk({
			id: 11, workItemCode: "REQ-11", name: "登录加固", workItemType: "需求", creatorName: "李四", status: "进行中",
			priority: "高", assignee: "张三", taskType: null, projectId: 3, projectName: "订单中心", iterationId: null, iterationName: null,
			planStartDate: null, planEndDate: null, description: "描述", requirementMarkdown: "# 需求", prototypeUrl: null, moduleName: "认证",
		}));

		const detail = await getWorkItemDetail(PLATFORM_URL, "gpt_test", 11);

		const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${PLATFORM_URL}/api/tasks/11`);
		expect(options).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer gpt_test" }) }));
		expect(detail).toMatchObject({ id: 11, requirementMarkdown: "# 需求", moduleName: "认证" });
	});
});

describe("getWorkItemLinks", () => {
	it("按工作项 ID 读取关联资源集合", async () => {
		mockFetch.mockReset();
		const links = {
			children: [], parentWorkItems: [], relatedWorkItems: [],
			testCases: [{ id: 7, title: "登录失败重试", moduleName: "认证", caseType: "功能", priority: "P1", testPlanName: "迭代回归" }],
			attachments: [{ id: 8, fileName: "原型.png", contentType: "image/png", fileSize: 2048 }],
		};
		mockFetch.mockResolvedValueOnce(platformOk(links));

		const result = await getWorkItemLinks(PLATFORM_URL, "gpt_test", 11);

		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${PLATFORM_URL}/api/tasks/11/links`);
		expect(result).toEqual(links);
	});
});
