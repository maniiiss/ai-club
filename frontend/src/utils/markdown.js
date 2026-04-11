const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const renderInline = (value) => {
    const placeholders = [];
    let text = escapeHtml(value);
    text = text.replace(/`([^`]+)`/g, (_, code) => {
        const token = `__CODE_${placeholders.length}__`;
        placeholders.push(`<code>${escapeHtml(code)}</code>`);
        return token;
    });
    text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => {
        const token = `__IMG_${placeholders.length}__`;
        placeholders.push(`<img src="${url}" alt="${escapeHtml(alt)}" />`);
        return token;
    });
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    placeholders.forEach((placeholder, index) => {
        text = text.replace(`__CODE_${index}__`, placeholder);
        text = text.replace(`__IMG_${index}__`, placeholder);
    });
    return text;
};
export const renderMarkdownToHtml = (markdown) => {
    if (!markdown || !markdown.trim()) {
        return '<p>-</p>';
    }
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let paragraph = [];
    let listType = null;
    let codeBlock = null;
    const flushParagraph = () => {
        if (!paragraph.length)
            return;
        html.push(`<p>${renderInline(paragraph.join('<br />'))}</p>`);
        paragraph = [];
    };
    const closeList = () => {
        if (!listType)
            return;
        html.push(`</${listType}>`);
        listType = null;
    };
    const flushCodeBlock = () => {
        if (!codeBlock)
            return;
        html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = null;
    };
    for (const rawLine of lines) {
        const line = rawLine.replace(/\t/g, '    ');
        if (line.trim().startsWith('```')) {
            flushParagraph();
            closeList();
            if (codeBlock) {
                flushCodeBlock();
            }
            else {
                codeBlock = [];
            }
            continue;
        }
        if (codeBlock) {
            codeBlock.push(line);
            continue;
        }
        if (!line.trim()) {
            flushParagraph();
            closeList();
            continue;
        }
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph();
            closeList();
            const level = headingMatch[1].length;
            html.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`);
            continue;
        }
        const blockquoteMatch = line.match(/^\s*>\s+(.*)$/);
        if (blockquoteMatch) {
            flushParagraph();
            closeList();
            html.push(`<blockquote>${renderInline(blockquoteMatch[1].trim())}</blockquote>`);
            continue;
        }
        const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (ulMatch) {
            flushParagraph();
            if (listType !== 'ul') {
                closeList();
                html.push('<ul>');
                listType = 'ul';
            }
            html.push(`<li>${renderInline(ulMatch[1].trim())}</li>`);
            continue;
        }
        const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
        if (olMatch) {
            flushParagraph();
            if (listType !== 'ol') {
                closeList();
                html.push('<ol>');
                listType = 'ol';
            }
            html.push(`<li>${renderInline(olMatch[1].trim())}</li>`);
            continue;
        }
        closeList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    closeList();
    flushCodeBlock();
    return html.join('') || '<p>-</p>';
};
//# sourceMappingURL=markdown.js.map