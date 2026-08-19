/**
 * Design 代码面板的展示格式化工具。
 * 业务意图：模型生成的 canonical 文件可能为了传输压成单行，但代码面板应保持
 * 可阅读；这里仅生成展示副本，不修改快照、磁盘文件或复制到剪贴板的原文。
 */

type CodeLanguage = 'html' | 'css' | 'javascript' | 'json' | 'image' | 'unknown';

const HTML_VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function hasMeaningfulLineBreaks(source: string): boolean {
	const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
	return lines.length > 1;
}

function formatHtml(source: string): string {
	const compact = source.replace(/>\s+</g, '><').trim();
	const tokens = compact.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
	const lines: string[] = [];
	let indent = 0;

	for (const rawToken of tokens) {
		const token = rawToken.trim();
		if (!token) continue;
		const closing = token.match(/^<\s*\/\s*([a-z0-9-]+)/i);
		if (closing) {
			indent = Math.max(0, indent - 1);
			lines.push(`${'  '.repeat(indent)}${token}`);
			continue;
		}
		const opening = token.match(/^<\s*([a-z0-9-]+)/i);
		lines.push(`${'  '.repeat(indent)}${token}`);
		if (opening && !token.startsWith('<!') && !token.startsWith('<!--') && !token.endsWith('/>') && !HTML_VOID_ELEMENTS.has(opening[1].toLowerCase())) indent += 1;
	}

	return lines.join('\n');
}

function formatCssDeclaration(line: string): string {
	return line.replace(/^\s*([^:;{}]+?)\s*:\s*/, '$1: ');
}

/** 对 CSS 结构字符做轻量排版，不解析或改写 CSS 值，避免破坏 url/calc/字符串。 */
function formatCss(source: string): string {
	const lines: string[] = [];
	let current = '';
	let indent = 0;
	let quote: string | null = null;
	let comment = false;
	let parentheses = 0;

	const push = (value = current): void => {
		const trimmed = value.trim();
		if (trimmed) lines.push(`${'  '.repeat(indent)}${indent > 0 && !trimmed.startsWith('/*') ? formatCssDeclaration(trimmed) : trimmed}`);
		current = '';
	};

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];
		if (comment) {
			current += char;
			if (char === '*' && next === '/') {
				current += '/';
				index += 1;
				comment = false;
				push();
			}
			continue;
		}
		if (!quote && char === '/' && next === '*') {
			current += '/*';
			index += 1;
			comment = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote && source[index - 1] !== '\\') quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === '(') parentheses += 1;
		if (char === ')') parentheses = Math.max(0, parentheses - 1);
		if (char === '{') {
			push(`${current.trim()} {`);
			indent += 1;
			continue;
		}
		if (char === '}') {
			push();
			indent = Math.max(0, indent - 1);
			push('}');
			continue;
		}
		if (char === ';' && parentheses === 0) {
			push(`${current.trim()};`);
			continue;
		}
		current += /\s/.test(char) ? (current.endsWith(' ') ? '' : ' ') : char;
	}
	push();
	return lines.join('\n');
}

/** 对 JS 做保守排版，只在字符串、注释和括号外按语句/代码块换行。 */
function formatJavaScript(source: string): string {
	const lines: string[] = [];
	let current = '';
	let indent = 0;
	let quote: string | null = null;
	let template = false;
	let lineComment = false;
	let blockComment = false;
	let parentheses = 0;
	let brackets = 0;

	const push = (value = current): void => {
		const trimmed = value.trim();
		if (trimmed) lines.push(`${'  '.repeat(indent)}${trimmed}`);
		current = '';
	};

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];
		if (lineComment) {
			current += char;
			if (char === '\n') {
				push();
				lineComment = false;
			}
			continue;
		}
		if (blockComment) {
			current += char;
			if (char === '*' && next === '/') {
				current += '/';
				index += 1;
				blockComment = false;
				push();
			}
			continue;
		}
		if (!quote && !template && char === '/' && next === '/') {
			current += '//';
			index += 1;
			lineComment = true;
			continue;
		}
		if (!quote && !template && char === '/' && next === '*') {
			current += '/*';
			index += 1;
			blockComment = true;
			continue;
		}
		if (quote || template) {
			current += char;
			if (char === (template ? '`' : quote) && source[index - 1] !== '\\') {
				quote = null;
				template = false;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === '`') {
			template = true;
			current += char;
			continue;
		}
		if (char === '(') parentheses += 1;
		if (char === ')') parentheses = Math.max(0, parentheses - 1);
		if (char === '[') brackets += 1;
		if (char === ']') brackets = Math.max(0, brackets - 1);
		if (char === '{') {
			push(`${current.trim()} {`);
			indent += 1;
			continue;
		}
		if (char === '}') {
			push();
			indent = Math.max(0, indent - 1);
			current = '}';
			if (next !== ';' && next !== ',' && next !== ')') push();
			continue;
		}
		if (char === ';' && parentheses === 0 && brackets === 0) {
			push(`${current.trim()};`);
			continue;
		}
		current += /\s/.test(char) ? (current.endsWith(' ') ? '' : ' ') : char;
	}
	push();
	return lines.join('\n');
}

/**
 * 返回代码面板专用的可读文本；已经有多行结构的源文件保持原样，避免展示层二次改写用户格式。
 */
export function formatDesignCode(source: string, language: CodeLanguage): string {
	if (!source || hasMeaningfulLineBreaks(source)) return source;
	if (language === 'html') return formatHtml(source);
	if (language === 'css') return formatCss(source);
	if (language === 'javascript') return formatJavaScript(source);
	if (language === 'json') {
		try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return source; }
	}
	return source;
}
