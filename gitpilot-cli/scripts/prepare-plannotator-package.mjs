/**
 * 为固定版本的 Plannotator 注入 Desktop sidecar 所需的资源路径兼容性。
 *
 * Bun 单文件二进制中的 import.meta.url 指向 Bun 的虚拟目录，扩展据此无法
 * 找到自身的 plannotator.json。此脚本只对锁定的上游单行常量做幂等替换；
 * 上游升级而导致匹配失败时直接报错，避免静默携带失效补丁发布。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(
	new URL("../node_modules/@plannotator/pi-extension/config.ts", import.meta.url),
);
const upstreamLine = 'const INTERNAL_CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "plannotator.json");';
const patchedBlock = `// Packaged hosts may provide this asset outside Bun's virtual module directory.
const packagedConfigPath = process.env.PLANNOTATOR_INTERNAL_CONFIG_PATH?.trim();
const INTERNAL_CONFIG_PATH =
\tpackagedConfigPath && existsSync(packagedConfigPath)
\t\t? packagedConfigPath
\t\t: join(dirname(fileURLToPath(import.meta.url)), "plannotator.json");`;

if (!existsSync(configPath)) {
	throw new Error(`Plannotator package is missing: ${configPath}`);
}

const source = readFileSync(configPath, "utf8");
if (source.includes(patchedBlock)) {
	process.stdout.write("Plannotator Desktop compatibility patch is already applied.\n");
} else if (source.includes(upstreamLine)) {
	writeFileSync(configPath, source.replace(upstreamLine, patchedBlock), "utf8");
	process.stdout.write("Applied Plannotator Desktop compatibility patch.\n");
} else {
	throw new Error(
		"Plannotator config.ts no longer matches the supported 0.27.3 source; update the Desktop compatibility patch before building.",
	);
}
