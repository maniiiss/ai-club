package com.aiclub.platform.util;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

import java.util.regex.Pattern;

public final class RichTextUtils {

    private static final Pattern HTML_TAG_PATTERN = Pattern.compile("</?[a-zA-Z][^>]*>");
    private static final Pattern MARKDOWN_IMAGE_PATTERN = Pattern.compile("!\\[[^\\]]*]\\(([^)]+)\\)");
    private static final Pattern MARKDOWN_LINK_PATTERN = Pattern.compile("\\[([^\\]]+)]\\(([^)]+)\\)");
    private static final Safelist COMMENT_HTML_SAFELIST = Safelist.none()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "pre", "code", "a", "img")
            .addAttributes("a", "href", "target", "rel")
            .addAttributes("img", "src", "alt", "title")
            .addProtocols("a", "href", "http", "https")
            .addProtocols("img", "src", "http", "https")
            .addEnforcedAttribute("a", "target", "_blank")
            .addEnforcedAttribute("a", "rel", "noopener noreferrer");
    private static final Document.OutputSettings OUTPUT_SETTINGS = new Document.OutputSettings().prettyPrint(false);

    private RichTextUtils() {
    }

    public static boolean containsHtml(String content) {
        return content != null && HTML_TAG_PATTERN.matcher(content).find();
    }

    public static String sanitizeCommentHtml(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }
        return Jsoup.clean(content.trim(), "", COMMENT_HTML_SAFELIST, OUTPUT_SETTINGS).trim();
    }

    public static boolean hasRenderableContent(String content) {
        if (content == null || content.isBlank()) {
            return false;
        }
        String trimmed = content.trim();
        if (containsHtml(trimmed)) {
            Document document = Jsoup.parseBodyFragment(sanitizeCommentHtml(trimmed));
            return !document.select("img[src]").isEmpty() || !document.text().trim().isEmpty();
        }
        return MARKDOWN_IMAGE_PATTERN.matcher(trimmed).find() || !trimmed.isBlank();
    }

    public static String extractPlainText(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }
        String trimmed = content.trim();
        if (containsHtml(trimmed)) {
            Document document = Jsoup.parseBodyFragment(sanitizeCommentHtml(trimmed));
            String text = document.text().replace('\u00A0', ' ').trim();
            if (!text.isEmpty()) {
                return text;
            }
            return document.selectFirst("img[src]") == null ? "" : "[图片]";
        }

        String normalized = MARKDOWN_IMAGE_PATTERN.matcher(trimmed).replaceAll("[图片]");
        normalized = MARKDOWN_LINK_PATTERN.matcher(normalized).replaceAll("$1");
        normalized = normalized
                .replace("**", "")
                .replace("__", "")
                .replace("*", "")
                .replace("_", "")
                .replace("~~", "")
                .replace("`", "")
                .replace(">", "")
                .replace("#", "");
        return normalized.replace('\u00A0', ' ').trim();
    }
}
