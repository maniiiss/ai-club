/**
 * 自研框架规则注册表。
 * 业务意图：框架族的公共规则与版本适配器分离，快开 2.0 只需新增适配器，不改 detector 主流程。
 */

export type FrameworkEvidenceCategory = "dependency" | "source" | "route" | "script" | "config" | "docs";
export type FrameworkRuleLayer = "family-common" | "version-adapter" | "module-capability";

export interface FrameworkScanFile {
	relativePath: string;
	content: string;
}

export interface FrameworkRule {
	id: string;
	filePattern: RegExp;
	pattern: RegExp;
	weight: number;
	category: FrameworkEvidenceCategory;
	layer: FrameworkRuleLayer;
	modules?: readonly string[];
	components?: readonly string[];
	version?: string;
}

export interface FrameworkAdapter {
	familyId: string;
	adapterId: string;
	name: string;
	supportedVersions: readonly string[];
	ruleSetVersion: string;
	rules: readonly FrameworkRule[];
	codingGuidance: readonly string[];
}

export interface FrameworkFamily {
	familyId: string;
	name: string;
	commonRules: readonly FrameworkRule[];
	adapters: readonly FrameworkAdapter[];
}

const anySource = /(?:^|\/)(?:src|scripts)(?:\/|$)|\.(?:java|kt|groovy|ts|tsx|vue|js|jsx)$/i;
const configFile = /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?|package\.json|application[^/]*\.(?:yml|yaml|properties)|pnpm-workspace\.yaml)$/i;
const groovyFile = /(?:^|\/)scripts\/.*\.groovy$/i;
const anyFile = /.*/;

const KUAIIKAI_COMMON_RULES: readonly FrameworkRule[] = [
	{
		id: "maven-com-zz-platform",
		filePattern: /(?:^|\/)pom\.xml$|(?:^|\/)build\.gradle(?:\.kts)?$/i,
		pattern: /com\.zz\.platform\s*[:<]/i,
		weight: 0.45,
		category: "dependency",
		layer: "family-common",
		components: ["java-backend"],
	},
	{
		id: "skzz-package",
		filePattern: /(?:^|\/)package\.json$/i,
		pattern: /["']@vunk\/skzz["']\s*:/i,
		weight: 0.35,
		category: "dependency",
		layer: "family-common",
		components: ["vue-frontend"],
	},
	{
		id: "skzz-service-api",
		filePattern: anySource,
		pattern: /\b(?:useBusiService|useFlowService|RestFetch)\b/i,
		weight: 0.15,
		category: "source",
		layer: "family-common",
		components: ["vue-frontend"],
	},
	{
		id: "busi-route",
		filePattern: anySource,
		pattern: /\/core\/busi\/(?:query|save|exec|uploadExec)\b/i,
		weight: 0.12,
		category: "route",
		layer: "family-common",
		components: ["vue-frontend"],
	},
	{
		id: "model-groovy-tools",
		filePattern: groovyFile,
		pattern: /\b(?:argument|sqlTool|platformSqlTool|redisTool|zzProps|messageTool)\s*\(/i,
		weight: 0.15,
		category: "script",
		layer: "family-common",
		modules: ["busi-data"],
		components: ["java-backend"],
	},
	{
		id: "zz-platform-config",
		filePattern: configFile,
		pattern: /\bzz\.(?:platform|geoserver)\b|\bfileServiceType\b/i,
		weight: 0.08,
		category: "config",
		layer: "family-common",
		modules: ["file", "gis"],
	},
	{
		id: "workflow-convention",
		filePattern: anyFile,
		pattern: /\b(?:zz_model_flow|system\/flow\/flow|startAndSubmit|useFlowService)\b/i,
		weight: 0.1,
		category: "source",
		layer: "module-capability",
		modules: ["workflow"],
	},
	{
		id: "message-convention",
		filePattern: anyFile,
		pattern: /\b(?:messageTool|MessageParam|system\/message)\b/i,
		weight: 0.05,
		category: "source",
		layer: "module-capability",
		modules: ["message"],
	},
	{
		id: "file-convention",
		filePattern: anyFile,
		pattern: /\b(?:obsTool|ossTool|gridFsTool|zz-platform-file-starter)\b/i,
		weight: 0.05,
		category: "source",
		layer: "module-capability",
		modules: ["file"],
	},
	{
		id: "gis-convention",
		filePattern: anyFile,
		pattern: /\b(?:GeoServerRESTManager|WMS|WFS|WCS|WMTS|zz-platform-gisserver-starter)\b/i,
		weight: 0.05,
		category: "source",
		layer: "module-capability",
		modules: ["gis"],
	},
	{
		id: "scheduler-convention",
		filePattern: /(?:^|\/)scripts\/.*(?:\/job\/|\.groovy$)|(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/i,
		pattern: /\b(?:Quartz|Spring\s+Task|@Scheduled)\b|\/job\//i,
		weight: 0.05,
		category: "source",
		layer: "module-capability",
		modules: ["scheduler"],
	},
	{
		id: "permission-convention",
		filePattern: anyFile,
		pattern: /\b(?:zz_model_config|allow_no_login|allow_no_auth)\b/i,
		weight: 0.05,
		category: "config",
		layer: "module-capability",
		modules: ["permission"],
	},
];

/** 1.0 适配器保存资料中已经确认的 Coding 约束；版本证据缺失时仍可作为当前唯一适配器使用。 */
const KUAIIKAI_V1_ADAPTER: FrameworkAdapter = {
	familyId: "kuaikai",
	adapterId: "kuaikai-v1",
	name: "快开",
	supportedVersions: ["1.0", "1"],
	ruleSetVersion: "kuaikai-v1-r1",
	rules: [
		{
			id: "kuaikai-v1-model-path",
			filePattern: /(?:^|\/)scripts\/model\//i,
			pattern: /\.(?:groovy|json)$/i,
			weight: 0.05,
			category: "script",
			layer: "version-adapter",
			modules: ["busi-data"],
		},
	],
	codingGuidance: [
		"前端业务读写优先使用 useBusiService/useFlowService，并沿用 dir、modelId、menuId、buttonId、datasetId",
		"后端业务逻辑优先放在 scripts/model/{dir}/{modelId}.groovy，通过 argument()、sqlTool() 和平台工具读取上下文",
		"dbTool.query/queryOne/execute 的 SQL 必须使用占位符传参，禁止字符串拼接",
		"工作流保存链通常使用 ConstantKt.SAVE_BUSI 与 system/flow/flow，提交动作使用 startAndSubmit",
		"消息、文件、GIS 和定时任务优先复用快开平台服务，不自行创建平行 REST 协议",
	],
};

const KUAIIKAI_FAMILY: FrameworkFamily = {
	familyId: "kuaikai",
	name: "快开",
	commonRules: KUAIIKAI_COMMON_RULES,
	adapters: [KUAIIKAI_V1_ADAPTER],
};

const FRAMEWORK_FAMILIES: readonly FrameworkFamily[] = [KUAIIKAI_FAMILY];

export function getFrameworkFamilies(): readonly FrameworkFamily[] {
	return FRAMEWORK_FAMILIES;
}

export function getFrameworkFamily(familyId: string): FrameworkFamily | undefined {
	return FRAMEWORK_FAMILIES.find((family) => family.familyId === familyId);
}
