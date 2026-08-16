/**
 * 工作区框架档案的稳定数据模型。
 * 业务意图：把“识别事实”和“给 Agent 的编码提示”分开保存，后续接入快开 2.0 或其它框架时不破坏旧绑定。
 */

export type FrameworkProfileStatus = "detected" | "ambiguous" | "not-detected" | "stale";
export type FrameworkScanCompleteness = "complete" | "partial";

export interface FrameworkEvidence {
	path: string;
	rule: string;
	matched: string;
	weight: number;
	line?: number;
	category?: string;
}

export interface FrameworkProfile {
	profileSchemaVersion: 1;
	familyId: string;
	adapterId?: string;
	name: string;
	version: string;
	versionSource?: string;
	versionConfidence?: number;
	status: FrameworkProfileStatus;
	confidence: number;
	scope: "workspace" | "subtree";
	rootPath?: string;
	components: string[];
	modules: string[];
	evidence: FrameworkEvidence[];
	codingGuidance: string[];
	ruleSetVersion: string;
	fingerprint: string;
	detectedAt: string;
	scanCompleteness?: FrameworkScanCompleteness;
}

const MAX_EVIDENCE = 64;
const MAX_TEXT = 180;

function clampConfidence(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(0.99, value));
}

function safeText(value: unknown, maxLength = MAX_TEXT): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value
		.replace(/[\r\n\t]+/g, " ")
		.replace(/(accessKey|secretKey|password|token|authorization|jdbc:[^\s]+)/gi, "$1=[REDACTED]")
		.trim();
	return normalized ? normalized.slice(0, maxLength) : undefined;
}

function safeStringArray(value: unknown, maxItems = 32): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => safeText(item, 120))
		.filter((item): item is string => !!item)
		.slice(0, maxItems);
}

/**
 * 校验并脱敏绑定文件中的 profile。
 * 绑定文件可能被用户手工编辑，任何不完整或疑似敏感字段都不能进入后续提示词。
 */
export function sanitizeFrameworkProfiles(value: unknown): FrameworkProfile[] {
	if (!Array.isArray(value)) return [];
	const profiles: FrameworkProfile[] = [];
	for (const candidate of value) {
		if (!candidate || typeof candidate !== "object") continue;
		const item = candidate as Record<string, unknown>;
		if (item.profileSchemaVersion !== 1 || typeof item.familyId !== "string" || typeof item.name !== "string") continue;
		const status = item.status;
		if (status !== "detected" && status !== "ambiguous" && status !== "not-detected" && status !== "stale") continue;
		const evidence = Array.isArray(item.evidence)
			? item.evidence.slice(0, MAX_EVIDENCE).flatMap((raw) => {
					if (!raw || typeof raw !== "object") return [];
					const evidenceItem = raw as Record<string, unknown>;
					const path = safeText(evidenceItem.path, 260);
					const rule = safeText(evidenceItem.rule, 120);
					const matched = safeText(evidenceItem.matched);
					if (!path || !rule || !matched) return [];
					return [{
						path,
						rule,
						matched,
						weight: clampConfidence(evidenceItem.weight),
						...(typeof evidenceItem.line === "number" && Number.isInteger(evidenceItem.line) && evidenceItem.line > 0
							? { line: evidenceItem.line }
							: {}),
						...(safeText(evidenceItem.category, 80) ? { category: safeText(evidenceItem.category, 80) } : {}),
					} satisfies FrameworkEvidence];
				})
			: [];
		const version = safeText(item.version, 40) ?? "unknown";
		const profile: FrameworkProfile = {
			profileSchemaVersion: 1,
			familyId: item.familyId.trim().slice(0, 80),
			...(safeText(item.adapterId, 80) ? { adapterId: safeText(item.adapterId, 80) } : {}),
			name: item.name.trim().slice(0, 120),
			version,
			...(safeText(item.versionSource, 80) ? { versionSource: safeText(item.versionSource, 80) } : {}),
			...(typeof item.versionConfidence === "number" ? { versionConfidence: clampConfidence(item.versionConfidence) } : {}),
			status,
			confidence: clampConfidence(item.confidence),
			scope: item.scope === "subtree" ? "subtree" : "workspace",
			...(safeText(item.rootPath, 260) ? { rootPath: safeText(item.rootPath, 260) } : {}),
			components: safeStringArray(item.components),
			modules: safeStringArray(item.modules),
			evidence,
			codingGuidance: safeStringArray(item.codingGuidance, 24),
			ruleSetVersion: safeText(item.ruleSetVersion, 80) ?? "unknown",
			fingerprint: safeText(item.fingerprint, 120) ?? "unknown",
			detectedAt: safeText(item.detectedAt, 80) ?? "unknown",
			...(item.scanCompleteness === "partial" ? { scanCompleteness: "partial" } : { scanCompleteness: "complete" }),
		};
		profiles.push(profile);
	}
	return profiles;
}

/** 将 profile 转成绑定文件中的人类可读技术栈摘要。 */
export function formatTechnologyStack(profiles: FrameworkProfile[]): string | undefined {
	const values = new Set<string>();
	for (const profile of profiles) {
		if (profile.status === "not-detected") continue;
		values.add(profile.name + (profile.version !== "unknown" ? ` ${profile.version}` : ""));
		for (const component of profile.components) {
			if (component === "java-backend") values.add("Java 后端");
			if (component === "vue-frontend") values.add("Vue 前端");
			if (component === "react-frontend") values.add("React 前端");
		}
	}
	return values.size > 0 ? Array.from(values).join("、") : undefined;
}

/** 只将短摘要注入提示词，不把全部扫描证据送入模型。 */
export function formatFrameworkProfilesPrompt(profiles: FrameworkProfile[]): string {
	const supported = profiles.filter((profile) => profile.status !== "not-detected");
	if (supported.length === 0) return "";
	const lines = ["", "## 当前工作区框架识别结果"];
	for (const profile of supported) {
		const version = profile.version !== "unknown" ? ` ${profile.version}` : "（版本未确认）";
		const adapter = profile.adapterId ? `，适配器 ${profile.adapterId}` : "，仅启用框架公共规则";
		lines.push(`- ${profile.name}${version}：${profile.status}，置信度 ${profile.confidence.toFixed(2)}${adapter}`);
		if (profile.components.length > 0) lines.push(`  - 组件：${profile.components.join("、")}`);
		if (profile.modules.length > 0) lines.push(`  - 模块：${profile.modules.join("、")}`);
		if (profile.status === "detected") {
			for (const guidance of profile.codingGuidance.slice(0, 8)) lines.push(`  - 编码约束：${guidance}`);
		} else {
			lines.push("  - 编码约束：当前识别不确定，只能遵循已确认的公共规则并先读取现有同类代码");
		}
	}
	lines.push("以上是本地规则检测结果；实现前仍需以当前源码、现有同类代码和用户要求为准。版本未确认或状态为 ambiguous 时，不得套用版本特有模板。", "");
	return lines.join("\n");
}
