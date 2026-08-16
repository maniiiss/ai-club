/**
 * 工作区框架识别器。
 * 业务意图：离线读取有限的配置和源码证据，输出可解释、可缓存、可扩展的框架 profile，不让 Agent 依赖目录名猜测。
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { FrameworkEvidence, FrameworkProfile } from "./framework-profile.ts";
import { getFrameworkFamilies, type FrameworkAdapter, type FrameworkRule, type FrameworkScanFile } from "./framework-registry.ts";

export interface FrameworkDetectionResult {
	profiles: FrameworkProfile[];
	technologyStack: string[];
	scannedFiles: number;
	scannedBytes: number;
	partial: boolean;
	fingerprint: string;
}

interface ScanOptions {
	maxFiles: number;
	maxBytes: number;
	maxFileBytes: number;
	maxDepth: number;
}

interface ScanResult {
	files: FrameworkScanFile[];
	bytes: number;
	partial: boolean;
	fingerprint: string;
}

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
	maxFiles: 240,
	maxBytes: 3 * 1024 * 1024,
	maxFileBytes: 512 * 1024,
	maxDepth: 6,
};

const IGNORED_DIRECTORIES = new Set([
	".git",
	".hg",
	".svn",
	".idea",
	".vscode",
	"node_modules",
	"target",
	"dist",
	"build",
	"coverage",
	".venv",
	"venv",
	"__pycache__",
	".gitpilot",
]);

const INTERESTING_NAMES = new Set([
	"pom.xml",
	"build.gradle",
	"build.gradle.kts",
	"package.json",
	"package-lock.json",
	"pnpm-workspace.yaml",
	"pnpm-lock.yaml",
	"yarn.lock",
	"gradle.properties",
	"settings.gradle",
	"settings.gradle.kts",
	"libs.versions.toml",
	"application.yml",
	"application.yaml",
	"application.properties",
	"README.md",
	"README.en.md",
]);

const INTERESTING_EXTENSIONS = new Set([".java", ".kt", ".groovy", ".ts", ".tsx", ".vue", ".js", ".jsx", ".yml", ".yaml", ".properties"]);

function toPosixPath(path: string): string {
	return path.replace(/\\/g, "/");
}

function isInterestingFile(relativePath: string): boolean {
	const normalized = toPosixPath(relativePath);
	const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
	if (INTERESTING_NAMES.has(baseName)) return true;
	if (/^scripts\/model(?:\/|$)/i.test(normalized)) return true;
	if (/^scripts\/.*\/job(?:\/|$)/i.test(normalized)) return true;
	return INTERESTING_EXTENSIONS.has(extname(baseName).toLowerCase());
}

async function scanWorkspace(root: string, options: ScanOptions = DEFAULT_SCAN_OPTIONS): Promise<ScanResult> {
	const files: FrameworkScanFile[] = [];
	let bytes = 0;
	let partial = false;

	async function visit(directory: string, depth: number): Promise<void> {
		if (depth > options.maxDepth || files.length >= options.maxFiles || bytes >= options.maxBytes) {
			partial = true;
			return;
		}
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			partial = true;
			return;
		}
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			if (files.length >= options.maxFiles || bytes >= options.maxBytes) {
				partial = true;
				return;
			}
			if (entry.name.startsWith(".") && entry.name !== ".github") continue;
			if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
			const absolutePath = join(directory, entry.name);
			const relativePath = toPosixPath(relative(root, absolutePath));
			if (entry.isDirectory()) {
				await visit(absolutePath, depth + 1);
				continue;
			}
			if (!entry.isFile() || !isInterestingFile(relativePath)) continue;
			let fileStat;
			try {
				fileStat = await stat(absolutePath);
			} catch {
				partial = true;
				continue;
			}
			if (fileStat.size > options.maxFileBytes || bytes + fileStat.size > options.maxBytes) {
				partial = true;
				continue;
			}
			try {
				const content = await readFile(absolutePath, "utf8");
				files.push({ relativePath, content });
				bytes += Buffer.byteLength(content, "utf8");
			} catch {
				partial = true;
			}
		}
	}

	await visit(root, 0);
	const hash = createHash("sha256");
	for (const file of files) hash.update(`${file.relativePath}\0${file.content}\0`);
	return { files, bytes, partial, fingerprint: `scan-1:${hash.digest("hex").slice(0, 24)}` };
}

function lineNumber(content: string, index: number): number {
	return content.slice(0, index).split("\n").length;
}

function redactMatch(value: string): string {
	return value
		.replace(/[\r\n\t]+/g, " ")
		.replace(/(accessKey|secretKey|password|token|authorization)\s*[:=]\s*[^,;\s]+/gi, "$1=[REDACTED]")
		.trim()
		.slice(0, 180);
}

function matchRule(file: FrameworkScanFile, rule: FrameworkRule): FrameworkEvidence | undefined {
	// README/文档只可作为人工参考，不能单独触发框架或版本识别。
	if (/\.(?:md|markdown|txt)$/i.test(file.relativePath)) return undefined;
	if (!rule.filePattern.test(file.relativePath)) return undefined;
	const match = rule.pattern.exec(file.content);
	if (!match || match.index === undefined) return undefined;
	return {
		path: file.relativePath,
		rule: rule.id,
		matched: redactMatch(match[0]),
		weight: rule.weight,
		line: lineNumber(file.content, match.index),
		category: rule.category,
	};
}

function uniqueEvidence(evidence: FrameworkEvidence[]): FrameworkEvidence[] {
	const seen = new Set<string>();
	return evidence.filter((item) => {
		const key = `${item.path}:${item.rule}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function scoreEvidence(evidence: FrameworkEvidence[]): number {
	return Math.min(0.99, evidence.reduce((sum, item) => sum + item.weight, 0));
}

function hasReliableFamilyEvidence(evidence: FrameworkEvidence[]): boolean {
	const categories = new Set(evidence.filter((item) => item.category !== "docs").map((item) => item.category));
	return evidence.some((item) => item.category === "dependency" || item.category === "config") || categories.size >= 2;
}

interface VersionSignal {
	version: string;
	source: string;
	confidence: number;
	evidence: FrameworkEvidence;
}

interface XmlBlock {
	content: string;
	index: number;
}

interface MavenDependency {
	groupId?: string;
	artifactId?: string;
	version?: string;
	index: number;
}

interface MavenPomModel {
	file: FrameworkScanFile;
	properties: Map<string, string>;
	projectVersion?: string;
	parent?: MavenDependency;
	dependencies: MavenDependency[];
}

function xmlBlocks(content: string, tag: string): XmlBlock[] {
	const blocks: XmlBlock[] = [];
	const expression = new RegExp(`<\\s*(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\s*\\/(?:[\\w.-]+:)?${tag}\\s*>`, "gi");
	for (const match of content.matchAll(expression)) {
		if (match.index === undefined || !match[1]) continue;
		blocks.push({ content: match[1], index: match.index });
	}
	return blocks;
}

function xmlTagValue(content: string, tag: string): string | undefined {
	const expression = new RegExp(`<\\s*(?:[\\w.-]+:)?${tag}\\b[^>]*>\\s*([^<]*?)\\s*<\\s*\\/(?:[\\w.-]+:)?${tag}\\s*>`, "i");
	return expression.exec(content)?.[1]?.trim() || undefined;
}

function parseMavenProperties(content: string): Map<string, string> {
	const properties = new Map<string, string>();
	const propertiesBlock = xmlBlocks(content, "properties")[0];
	if (!propertiesBlock) return properties;
	const expression = /<\s*([A-Za-z_][\w.-]*)\s*>([^<]+?)<\s*\/\s*\1\s*>/g;
	for (const match of propertiesBlock.content.matchAll(expression)) {
		if (match[1] && match[2]) properties.set(match[1], match[2].trim());
	}
	return properties;
}

function parseMavenDependencies(content: string): MavenDependency[] {
	return xmlBlocks(content, "dependency").map((block) => ({
		groupId: xmlTagValue(block.content, "groupId"),
		artifactId: xmlTagValue(block.content, "artifactId"),
		version: xmlTagValue(block.content, "version"),
		index: block.index,
	}));
}

function parseMavenFile(file: FrameworkScanFile): MavenPomModel {
	const parentBlock = xmlBlocks(file.content, "parent")[0];
	return {
		file,
		properties: parseMavenProperties(file.content),
		projectVersion: xmlTagValue(file.content, "version"),
		parent: parentBlock
			? {
				groupId: xmlTagValue(parentBlock.content, "groupId"),
				artifactId: xmlTagValue(parentBlock.content, "artifactId"),
				version: xmlTagValue(parentBlock.content, "version"),
				index: parentBlock.index,
			}
			: undefined,
		dependencies: parseMavenDependencies(file.content),
	};
}

function normalizeVersionToken(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const cleaned = value
		.trim()
		.replace(/^['"`]|['"`]$/g, "")
		.replace(/^[~^<>= ]+/, "");
	const match = /^(\d+(?:\.\d+){0,4}(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?)/.exec(cleaned);
	return match?.[1];
}

function resolveMavenValue(raw: string | undefined, properties: Map<string, string>, fallbackProperties: Map<string, string>): string | undefined {
	if (!raw) return undefined;
	let value = raw.trim();
	for (let attempt = 0; attempt < 8; attempt += 1) {
		let replaced = false;
		value = value.replace(/\$\{([^}]+)\}/g, (placeholder, key: string) => {
			const replacement = properties.get(key) ?? fallbackProperties.get(key);
			if (replacement === undefined) return placeholder;
			replaced = true;
			return replacement;
		});
		if (!replaced || !/\$\{[^}]+\}/.test(value)) break;
	}
	return /\$\{[^}]+\}/.test(value) ? undefined : normalizeVersionToken(value);
}

function isKuaikaiCoordinate(groupId: string | undefined, artifactId: string | undefined): boolean {
	return Boolean(groupId && (/^com\.zz\.platform(?:\.|$)/i.test(groupId) || /zz-platform/i.test(artifactId ?? "")));
}

function createVersionSignal(
	file: FrameworkScanFile,
	version: string | undefined,
	source: string,
	confidence: number,
	rule: string,
	index: number,
	matched: string,
): VersionSignal | undefined {
	const normalizedVersion = normalizeVersionToken(version);
	if (!normalizedVersion) return undefined;
	return {
		version: normalizedVersion,
		source,
		confidence,
		evidence: {
			path: file.relativePath,
			rule,
			matched: redactMatch(matched),
			weight: confidence,
			line: lineNumber(file.content, index),
			category: "dependency",
		},
	};
}

function extractMavenVersionSignals(files: FrameworkScanFile[]): VersionSignal[] {
	const models = files.filter((file) => /(?:^|\/)pom\.xml$/i.test(file.relativePath)).map(parseMavenFile);
	if (models.length === 0) return [];
	const fallbackProperties = new Map<string, string>();
	for (const model of models) {
		for (const [key, value] of model.properties) {
			if (fallbackProperties.has(key)) continue;
			fallbackProperties.set(key, value);
		}
		if (model.projectVersion) fallbackProperties.set("project.version", model.projectVersion);
	}
	const managedVersions = new Map<string, { version: string; confidence: number; source: string; index: number; file: FrameworkScanFile }>();
	for (const model of models) {
		for (const dependency of model.dependencies) {
			if (!dependency.groupId || !dependency.artifactId || !isKuaikaiCoordinate(dependency.groupId, dependency.artifactId)) continue;
			const version = resolveMavenValue(dependency.version, model.properties, fallbackProperties);
			if (!version) continue;
			managedVersions.set(`${dependency.groupId}:${dependency.artifactId}`, {
				version,
				confidence: dependency.version?.includes("${") ? 0.93 : 0.9,
				source: dependency.version?.includes("${") ? "maven-property" : "maven-dependency-management",
				index: dependency.index,
				file: model.file,
			});
		}
	}
	const signals: VersionSignal[] = [];
	for (const model of models) {
		if (model.parent && isKuaikaiCoordinate(model.parent.groupId, model.parent.artifactId)) {
			const version = resolveMavenValue(model.parent.version, model.properties, fallbackProperties);
			const signal = createVersionSignal(model.file, version, "maven-parent", 0.92, "maven-parent-version", model.parent.index, `${model.parent.groupId}:${model.parent.artifactId}:${version ?? ""}`);
			if (signal) signals.push(signal);
		}
		for (const dependency of model.dependencies) {
			if (!dependency.groupId || !dependency.artifactId || !isKuaikaiCoordinate(dependency.groupId, dependency.artifactId)) continue;
			const key = `${dependency.groupId}:${dependency.artifactId}`;
			const managed = managedVersions.get(key);
			const directVersion = resolveMavenValue(dependency.version, model.properties, fallbackProperties);
			const version = directVersion ?? managed?.version;
			if (!version) continue;
			const source = directVersion
				? dependency.version?.includes("${")
					? "maven-property"
					: "maven-dependency"
				: managed?.source === "maven-dependency-management"
					? "maven-bom"
					: "maven-managed-version";
			const confidence = directVersion
				? dependency.version?.includes("${")
					? 0.93
					: 0.97
				: managed?.confidence ?? 0.82;
			const signal = createVersionSignal(model.file, version, source, confidence, `version-${source}`, dependency.index, `${dependency.groupId}:${dependency.artifactId}:${version}`);
			if (signal) signals.push(signal);
		}
	}
	return signals;
}

function parseGradleProperties(files: FrameworkScanFile[]): Map<string, string> {
	const properties = new Map<string, string>();
	for (const file of files) {
		if (!/(?:gradle\.properties|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|libs\.versions\.toml)$/i.test(file.relativePath)) continue;
		const expression = /(?:^|[\n;])\s*(?:ext\.)?([A-Za-z_][\w.-]*)(?:\s*[:=]\s*|\s*=\s*)(?:["']?)([0-9]+(?:\.[0-9A-Za-z_-]+){0,5})(?:["']?)/g;
		for (const match of file.content.matchAll(expression)) {
			if (match[1] && match[2] && /(zz|kuaikai|platform)/i.test(match[1]) && /version/i.test(match[1])) properties.set(match[1], match[2]);
		}
	}
	return properties;
}

function resolveGradleVersion(raw: string | undefined, properties: Map<string, string>): string | undefined {
	if (!raw) return undefined;
	const cleaned = raw.replace(/^\$\{?([^}]+)\}?$/, "$1");
	return normalizeVersionToken(properties.get(cleaned) ?? cleaned);
}

function extractGradleVersionSignals(files: FrameworkScanFile[]): VersionSignal[] {
	const properties = parseGradleProperties(files);
	const signals: VersionSignal[] = [];
	for (const file of files) {
		if (!/(?:^|\/)build\.gradle(?:\.kts)?$/i.test(file.relativePath)) continue;
		const coordinateExpression = /com\.zz\.platform:[A-Za-z0-9_.-]+:([^\s"'(),}]+)/gi;
		for (const match of file.content.matchAll(coordinateExpression)) {
			if (match.index === undefined) continue;
			const version = resolveGradleVersion(match[1], properties);
			const signal = createVersionSignal(file, version, "gradle-coordinate", 0.96, "gradle-kuaikai-coordinate", match.index, match[0]);
			if (signal) signals.push(signal);
		}
		const mapExpressions = [
			/group\s*:\s*["']com\.zz\.platform["'][\s\S]{0,260}?version\s*:\s*["']?([^"'\s,}]+)["']?/gi,
			/version\s*:\s*["']?([^"'\s,}]+)["']?[\s\S]{0,260}?group\s*:\s*["']com\.zz\.platform["']/gi,
		];
		for (const expression of mapExpressions) {
			for (const match of file.content.matchAll(expression)) {
				if (match.index === undefined) continue;
				const version = resolveGradleVersion(match[1], properties);
				const signal = createVersionSignal(file, version, "gradle-map", 0.9, "gradle-kuaikai-map", match.index, match[0]);
				if (signal) signals.push(signal);
			}
		}
	}
	return signals;
}

function isPackageJson(file: FrameworkScanFile): boolean {
	return /(?:^|\/)package\.json$/i.test(file.relativePath);
}

function isNpmLockFile(file: FrameworkScanFile): boolean {
	return /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(file.relativePath);
}

function addNpmJsonVersions(value: unknown, versions: string[]): void {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (const item of value) addNpmJsonVersions(item, versions);
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		if (key === "@vunk/skzz" && typeof child === "string") versions.push(child);
		if (/(?:^|\/)node_modules\/@vunk\/skzz$/i.test(key) && child && typeof child === "object") {
			const version = (child as Record<string, unknown>).version;
			if (typeof version === "string") versions.push(version);
		}
		addNpmJsonVersions(child, versions);
	}
}

function addNpmYamlVersions(value: unknown, versions: string[]): void {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (const item of value) addNpmYamlVersions(item, versions);
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		const packageKey = key.match(/(?:^|\/)@vunk\/skzz@([0-9][^/\s:'"]*)/i);
		if (packageKey?.[1]) versions.push(packageKey[1]);
		if (key === "@vunk/skzz" && child && typeof child === "object") {
			const version = (child as Record<string, unknown>).version;
			if (typeof version === "string") versions.push(version);
		}
		addNpmYamlVersions(child, versions);
	}
}

function extractNpmVersionSignals(files: FrameworkScanFile[]): VersionSignal[] {
	const signals: VersionSignal[] = [];
	for (const file of files) {
		if (isPackageJson(file)) {
			try {
				const versions: string[] = [];
				const parsed: unknown = JSON.parse(file.content);
				const dependencyGroups = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>) : [];
				for (const group of dependencyGroups) {
					if (!group || typeof group !== "object" || Array.isArray(group)) continue;
					const value = (group as Record<string, unknown>)["@vunk/skzz"];
					if (typeof value === "string" && !value.startsWith("workspace:")) versions.push(value);
				}
				for (const version of versions) {
					const index = file.content.search(/[@'"]vunk\/skzz/);
					const signal = createVersionSignal(file, version, "npm-dependency", /^\d/.test(version) ? 0.9 : 0.58, "npm-kuaikai-dependency", Math.max(0, index), `@vunk/skzz:${version}`);
					if (signal) signals.push(signal);
				}
			} catch {
				// package.json 可能包含尚未完成编辑的内容，不能阻断其它框架证据扫描。
			}
			continue;
		}
		if (!isNpmLockFile(file)) continue;
		const versions: string[] = [];
		try {
			if (/package-lock\.json$/i.test(file.relativePath)) addNpmJsonVersions(JSON.parse(file.content) as unknown, versions);
			else if (/pnpm-lock\.yaml$/i.test(file.relativePath)) {
				addNpmYamlVersions(parseYaml(file.content) as unknown, versions);
				// 兼容旧版或非标准 pnpm lockfile；YAML 解析失败时仍可从包键和 version 行取证。
				for (const match of file.content.matchAll(/["']?@vunk\/skzz["']?:[\s\S]{0,180}?\bversion:\s*([0-9][^\s#]+)/gi)) {
					if (match[1]) versions.push(match[1]);
				}
				for (const match of file.content.matchAll(/(?:^|[/'"])@vunk\/skzz@([0-9][^/\s:'"]*)/g)) {
					if (match[1]) versions.push(match[1]);
				}
			}
		} catch {
			// 锁文件格式损坏时仍保留源码和依赖名称证据；下面的纯文本兜底不依赖 YAML AST。
			for (const match of file.content.matchAll(/["']?@vunk\/skzz["']?:[\s\S]{0,180}?\bversion:\s*([0-9][^\s#]+)/gi)) {
				if (match[1]) versions.push(match[1]);
			}
		}
		if (/yarn\.lock$/i.test(file.relativePath)) {
			for (const match of file.content.matchAll(new RegExp("(?:^|\\n)\\s*[\"']?@vunk/skzz@[^\\n:]+[\"']?:?[\\s\\S]{0,240}?\\n\\s*version\\s+[\"']([^\"']+)[\"']", "gi"))) {
				if (match[1]) versions.push(match[1]);
			}
		}
		for (const version of versions) {
			const index = file.content.indexOf("@vunk/skzz");
			const signal = createVersionSignal(file, version, "npm-lockfile", 0.98, "npm-kuaikai-lockfile", Math.max(0, index), `@vunk/skzz:${version}`);
			if (signal) signals.push(signal);
		}
	}
	return signals;
}

function extractVersionSignals(files: FrameworkScanFile[]): VersionSignal[] {
	return [...extractMavenVersionSignals(files), ...extractGradleVersionSignals(files), ...extractNpmVersionSignals(files)];
}

function normalizeMajorMinor(version: string): string {
	const match = version.match(/(\d+)(?:\.(\d+))?/);
	return match ? `${match[1]}${match[2] ? `.${match[2]}` : ""}` : version;
}

function detectTechnologyStack(files: FrameworkScanFile[]): string[] {
	const values = new Set<string>();
	for (const file of files) {
		if (/\.(?:java|kt)$/i.test(file.relativePath)) values.add("Java");
		if (/(?:^|\/)pom\.xml$|build\.gradle(?:\.kts)?$/i.test(file.relativePath)) {
			if (/spring-boot|org\.springframework\.boot/i.test(file.content)) values.add("Spring Boot");
			if (/mybatis/i.test(file.content)) values.add("MyBatis");
			if (/org\.springframework/i.test(file.content)) values.add("Spring");
		}
		if (/(?:^|\/)package\.json$/i.test(`/${file.relativePath}`)) {
			if (/["']vue["']\s*:/i.test(file.content)) values.add("Vue");
			if (/["']typescript["']\s*:/i.test(file.content) || /\.tsx?$/i.test(file.relativePath)) values.add("TypeScript");
			if (/["']@vunk\/skzz["']\s*:/i.test(file.content)) values.add("@vunk/skzz");
		}
	}
	return Array.from(values);
}

function selectAdapter(adapters: readonly FrameworkAdapter[], versionSignals: VersionSignal[]): {
	adapter?: FrameworkAdapter;
	version: string;
	versionSource: string;
	versionConfidence: number;
	ambiguous: boolean;
} {
	const versions = versionSignals.map((signal) => ({ ...signal, version: normalizeMajorMinor(signal.version) }));
	const matching = adapters.filter((adapter) => versions.some((signal) => adapter.supportedVersions.includes(signal.version)));
	if (matching.length > 1) {
		return { version: "unknown", versionSource: "conflicting-evidence", versionConfidence: 0, ambiguous: true };
	}
	if (matching.length === 1) {
		const signal = versions.find((candidate) => matching[0].supportedVersions.includes(candidate.version));
		return {
			adapter: matching[0],
			version: signal?.version ?? "unknown",
			versionSource: signal?.source ?? "adapter-default",
			versionConfidence: signal?.confidence ?? 0.4,
			ambiguous: false,
		};
	}
	if (versions.length > 0 && adapters.length === 1) {
		// 已有明确版本但注册表尚未提供对应适配器时，不能把它静默降级成 v1。
		const strongestSignal = versions.reduce((best, current) => (current.confidence > best.confidence ? current : best), versions[0]);
		return {
			version: "unknown",
			versionSource: "unsupported-version",
			versionConfidence: strongestSignal.confidence,
			ambiguous: true,
		};
	}
	// 没有版本证据时只确认框架族，不能把当前唯一适配器当作默认版本。
	return { version: "unknown", versionSource: "no-version-evidence", versionConfidence: 0, ambiguous: adapters.length > 1 };
}

function buildProfile(
	root: string,
	family: { familyId: string; name: string; commonRules: readonly FrameworkRule[]; adapters: readonly FrameworkAdapter[] },
	scan: ScanResult,
): FrameworkProfile | undefined {
	const commonEvidence = uniqueEvidence(scan.files.flatMap((file) => family.commonRules.map((rule) => matchRule(file, rule)).filter((item): item is FrameworkEvidence => !!item)));
	if (!hasReliableFamilyEvidence(commonEvidence)) return undefined;
	const confidence = scoreEvidence(commonEvidence);
	const versionSignals = extractVersionSignals(scan.files);
	const selection = selectAdapter(family.adapters, versionSignals);
	const adapterEvidence = selection.adapter
		? uniqueEvidence(scan.files.flatMap((file) => selection.adapter!.rules.map((rule) => matchRule(file, rule)).filter((item): item is FrameworkEvidence => !!item)))
		: [];
	const versionEvidence = uniqueEvidence(versionSignals.map((signal) => signal.evidence));
	const evidence = uniqueEvidence([...commonEvidence, ...adapterEvidence, ...versionEvidence]);
	const modules = new Set<string>();
	const components = new Set<string>();
	for (const rule of [...family.commonRules, ...(selection.adapter?.rules ?? [])]) {
		if (!scan.files.some((file) => matchRule(file, rule))) continue;
		for (const module of rule.modules ?? []) modules.add(module);
		for (const component of rule.components ?? []) components.add(component);
	}
	// 依赖 + 源码/脚本是两个独立证据面；扫描存在少量缺口时仍可确认框架族，
	// 但版本未知时不会凭空启用版本特有模板（codingGuidance 仍由后续提示词分层控制）。
	const evidenceCategories = new Set(commonEvidence.map((item) => item.category));
	const strongFamilyEvidence = evidenceCategories.has("dependency") && evidenceCategories.size >= 2;
	const status: FrameworkProfile["status"] = selection.ambiguous
		? "ambiguous"
		: confidence >= 0.75 || (strongFamilyEvidence && confidence >= 0.6)
			? "detected"
			: confidence >= 0.45
				? "ambiguous"
				: "not-detected";
	return {
		profileSchemaVersion: 1,
		familyId: family.familyId,
		...(selection.adapter ? { adapterId: selection.adapter.adapterId } : {}),
		name: family.name,
		version: selection.version,
		versionSource: selection.versionSource,
		versionConfidence: selection.versionConfidence,
		status,
		confidence,
		scope: "workspace",
		rootPath: ".",
		components: Array.from(components),
		modules: Array.from(modules),
		evidence,
		codingGuidance: selection.adapter && selection.version !== "unknown" && selection.versionConfidence >= 0.75 ? selection.adapter.codingGuidance.slice(0, 16) : [],
		ruleSetVersion: selection.adapter?.ruleSetVersion ?? "family-common-r1",
		fingerprint: scan.fingerprint,
		detectedAt: new Date().toISOString(),
		...(scan.partial ? { scanCompleteness: "partial" } : { scanCompleteness: "complete" }),
	};
}

/** 扫描当前工作区并返回所有命中的框架 profile。 */
export async function detectFrameworks(workspaceRoot: string, options?: Partial<ScanOptions>): Promise<FrameworkDetectionResult> {
	const scan = await scanWorkspace(workspaceRoot, { ...DEFAULT_SCAN_OPTIONS, ...options });
	const profiles = getFrameworkFamilies()
		.map((family) => buildProfile(workspaceRoot, family, scan))
		.filter((profile): profile is FrameworkProfile => !!profile && profile.status !== "not-detected");
	return {
		profiles,
		technologyStack: detectTechnologyStack(scan.files),
		scannedFiles: scan.files.length,
		scannedBytes: scan.bytes,
		partial: scan.partial,
		fingerprint: scan.fingerprint,
	};
}
