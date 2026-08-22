#!/usr/bin/env node
/**
 * 从 @phosphor-icons/react 的 defs 生成 Canvas 图标字典（Desktop 渲染端）
 * 和图标名称清单（CLI 校验端），两端共享同一份词汇表。
 *
 * 用法：node scripts/generate-canvas-icon-dictionary.mjs [defs目录]
 * 默认读取 gitpilot-desktop/node_modules/@phosphor-icons/react/dist/defs。
 * 升级 @phosphor-icons/react 后需要重新运行并提交生成的两个文件。
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defsDir = process.argv[2] ?? join(repoRoot, "gitpilot-desktop", "node_modules", "@phosphor-icons", "react", "dist", "defs");
const dictionaryTarget = join(repoRoot, "gitpilot-desktop", "src", "design", "canvas-icon-dictionary.generated.ts");
const manifestTarget = join(repoRoot, "gitpilot-cli", "src", "modes", "rpc", "design-icon-manifest.generated.ts");
/** 只打包协议支持的三档字重；duotone 依赖透明度双层路径，thin/light 由渲染端降级为 regular。 */
const WEIGHTS = ["regular", "bold", "fill"];

function pascalToKebab(value) {
	// 先拆连续大写的缩写边界（XCircle→x-circle、QRCode→qr-code），再拆普通驼峰边界。
	return value.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * defs 文件是 new Map([["bold", jsx], ["duotone", jsx], ...]) 结构。
 * 按字重标记切段后抽取段内所有 path 的 d 字符串，多条子路径用空格拼接。
 */
function extractWeightPaths(source) {
	const marker = /\[\s*"([a-z]+)"\s*,/g;
	const segments = [];
	let match;
	while ((match = marker.exec(source))) segments.push({ weight: match[1], start: marker.lastIndex, end: -1 });
	for (let index = 0; index < segments.length; index += 1) segments[index].end = index + 1 < segments.length ? segments[index + 1].start : source.length;
	const result = {};
	const pathD = /\bd:\s*"((?:[^"\\]|\\.)*)"/g;
	for (const segment of segments) {
		if (!WEIGHTS.includes(segment.weight)) continue;
		const body = source.slice(segment.start, segment.end);
		const paths = [];
		let dMatch;
		while ((dMatch = pathD.exec(body))) paths.push(dMatch[1]);
		if (paths.length) result[segment.weight] = paths.join(" ");
	}
	return result;
}

if (!statSync(defsDir, { throwIfNoEntry: false })?.isDirectory()) {
	console.error(`找不到图标 defs 目录：${defsDir}`);
	console.error("请先在 gitpilot-desktop 安装 @phosphor-icons/react，或显式传入 defs 目录路径。");
	process.exit(1);
}

const dictionary = {};
for (const entry of readdirSync(defsDir)) {
	if (!entry.endsWith(".es.js")) continue;
	const name = pascalToKebab(entry.slice(0, -".es.js".length));
	const weights = extractWeightPaths(readFileSync(join(defsDir, entry), "utf8"));
	if (!weights.regular && !weights.bold && !weights.fill) continue;
	dictionary[name] = weights;
}

const names = Object.keys(dictionary).sort((a, b) => a.localeCompare(b));
const dictionaryBody = names.map((name) => `\t${JSON.stringify(name)}: ${JSON.stringify(dictionary[name])},`).join("\n");
const dictionaryFile = `// 本文件由 scripts/generate-canvas-icon-dictionary.mjs 自动生成，请勿手改。
// 数据来源：@phosphor-icons/react dist/defs，仅包含 regular/bold/fill 三档字重。
// path 处于 256×256 视口；渲染端负责按视口缩放与描边补偿。
export const CANVAS_ICON_DICTIONARY = Object.freeze({
${dictionaryBody}
});
`;

const manifestFile = `// 本文件由 scripts/generate-canvas-icon-dictionary.mjs 自动生成，请勿手改。
// 与 gitpilot-desktop 的 canvas-icon-dictionary.generated.ts 同源，作为模型输入的图标名校验清单。
export const DESIGN_ICON_NAMES = Object.freeze([${names.map((name) => JSON.stringify(name)).join(",")}]);

export const DESIGN_ICON_NAME_SET = Object.freeze(new Set(DESIGN_ICON_NAMES));
`;

mkdirSync(dirname(dictionaryTarget), { recursive: true });
mkdirSync(dirname(manifestTarget), { recursive: true });
writeFileSync(dictionaryTarget, dictionaryFile, "utf8");
writeFileSync(manifestTarget, manifestFile, "utf8");

const weightCounts = Object.fromEntries(WEIGHTS.map((weight) => [weight, names.filter((name) => Boolean(dictionary[name][weight])).length]));
const dictionaryBytes = Buffer.byteLength(dictionaryFile, "utf8");
console.log(`已生成 ${names.length} 个图标（字重覆盖：${WEIGHTS.map((weight) => `${weight}=${weightCounts[weight]}`).join("、 ")}）`);
console.log(`字典：${dictionaryTarget}（${(dictionaryBytes / 1024).toFixed(0)} KB）`);
console.log(`清单：${manifestTarget}（${(Buffer.byteLength(manifestFile, "utf8") / 1024).toFixed(0)} KB）`);
