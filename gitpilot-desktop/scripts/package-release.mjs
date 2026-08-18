import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

/**
 * 将 Tauri 产物整理成后台发布中心可上传的目录。
 * 业务意图：发布者只上传构建结果，脚本负责在上传前阻断三处版本漂移和缺少签名。
 */
const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(process.env.GITPILOT_RELEASE_SOURCE ?? join(root, 'src-tauri', 'target', 'release', 'bundle'))
const outputRoot = resolve(process.env.GITPILOT_RELEASE_OUTPUT ?? join(root, 'release-artifacts'))
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const cargoToml = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const packageVersion = String(packageJson.version)
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const tauriVersion = String(tauriConfig.version)

if (!cargoVersion || packageVersion !== cargoVersion || packageVersion !== tauriVersion) {
	throw new Error(`版本不一致：package.json=${packageVersion} Cargo=${cargoVersion ?? '-'} tauri=${tauriVersion}`)
}

if (!tauriConfig.bundle?.createUpdaterArtifacts || !tauriConfig.plugins?.updater?.pubkey || !tauriConfig.plugins?.updater?.endpoints?.length) {
	throw new Error('Tauri updater 配置不完整：需要 createUpdaterArtifacts、pubkey 和 endpoint')
}

const files = []
function walk(directory) {
	if (!existsSync(directory)) return
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filePath = join(directory, entry.name)
		if (entry.isDirectory()) walk(filePath)
		else files.push(filePath)
	}
}
walk(sourceRoot)

const groups = { msi: [], nsis: [], updater: [], signature: [] }
for (const file of files) {
	const name = basename(file).toLowerCase()
	if (name.endsWith('.sig')) groups.signature.push(file)
	else if (name.endsWith('.msi')) groups.msi.push(file)
	else if (name.endsWith('.exe')) groups.nsis.push(file)
	else if (name.endsWith('.zip')) groups.updater.push(file)
}
for (const [group, matches] of Object.entries(groups)) {
	if (!matches.length) throw new Error(`构建产物缺失：${group}（扫描目录 ${sourceRoot}）`)
}

const destination = join(outputRoot, packageVersion)
rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
for (const [group, matches] of Object.entries(groups)) {
	const groupDir = join(destination, group)
	mkdirSync(groupDir, { recursive: true })
	for (const source of matches) cpSync(source, join(groupDir, basename(source)))
}

const manifest = {
	version: packageVersion,
	channel: 'stable',
	platform: 'windows',
	arch: 'x86_64',
	artifacts: Object.fromEntries(Object.entries(groups).map(([group, matches]) => [group, matches.map((file) => basename(file))])),
	generatedAt: new Date().toISOString(),
}
const manifestPath = join(destination, 'release-artifacts.json')
await import('node:fs/promises').then(({ writeFile }) => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
console.log(`已整理 GitPilot Desktop ${packageVersion} 发布产物：${destination}`)
