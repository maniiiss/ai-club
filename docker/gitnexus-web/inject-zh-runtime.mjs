import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const indexPath = '/app/dist/index.html'
const runtimeAssetPath = '/app/dist/gitnexus-zh-runtime.js'
const runtimeSourcePath = '/tmp/gitnexus-zh-runtime.js'
const runtimeHash = createHash('sha256')
  .update(readFileSync(runtimeSourcePath))
  .digest('hex')
  .slice(0, 12)
const marker = `<script src="/gitnexus-zh-runtime.js?v=${runtimeHash}"></script>`
const configMarker = '<script src="/gitnexus-runtime-config.js"></script>'

copyFileSync(runtimeSourcePath, runtimeAssetPath)

let html = readFileSync(indexPath, 'utf8')
html = html.replace('<html lang="en">', '<html lang="zh-CN">')
html = html.replace('<title>GitNexus</title>', '<title>GitNexus 全仓图</title>')
html = html.replace(/\s*<script src="\/gitnexus-runtime-config\.js"\s*><\/script>\n?/g, '\n')
html = html.replace(/\s*<script src="\/gitnexus-zh-runtime\.js(?:\?v=[^"]*)?"(?: defer)?><\/script>\n?/g, '\n')
if (!html.includes(configMarker)) {
  html = html.replace(/(\s*<script type="module"[^>]+><\/script>)/, `\n    ${configMarker}$1`)
}
if (!html.includes(marker)) {
  html = html.replace(/(\s*<script type="module"[^>]+><\/script>)/, `\n    ${marker}$1`)
}
writeFileSync(indexPath, html, 'utf8')
