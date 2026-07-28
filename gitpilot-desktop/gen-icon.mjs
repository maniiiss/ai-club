// 一次性脚本：把 frontend-public 的 GitPilot 标志 SVG 渲染为 1024 PNG，供 tauri icon 生成全套图标。
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '..', 'frontend-public', 'public', 'brand-icon.svg');
const outPath = resolve(here, 'app-icon.png');

const svg = readFileSync(svgPath, 'utf8');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 }, background: '#0b0d12' });
const png = resvg.render().asPng();
writeFileSync(outPath, png);
console.log(`生成 ${outPath}（${png.length} bytes）`);
