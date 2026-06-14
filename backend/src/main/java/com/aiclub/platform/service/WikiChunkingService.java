package com.aiclub.platform.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Wiki 页面切块服务。
 * 业务意图：把整页 Wiki 拆成稳定、可 rerank 的知识片段，避免“一页一向量”导致召回粗糙。
 */
@Service
public class WikiChunkingService {

    private static final int MAX_CHARS_PER_CHUNK = 800;
    private static final int TARGET_CHARS_PER_CHUNK = 600;
    private static final int OVERLAP_CHARS = 100;

    public List<WikiChunk> chunkMarkdown(String pageType,
                                         Long pageId,
                                         Integer versionNumber,
                                         String title,
                                         String path,
                                         String markdown) {
        String normalizedTitle = defaultString(title);
        String normalizedPath = defaultString(path);
        String content = defaultString(markdown);
        if (content.isBlank()) {
            return List.of(new WikiChunk(
                    chunkId(pageType, pageId, versionNumber, 0),
                    0,
                    normalizedTitle,
                    normalizedPath,
                    normalizedTitle,
                    normalizedTitle,
                    countChars(normalizedTitle)
            ));
        }
        List<Section> sections = splitSections(normalizedTitle, content);
        List<WikiChunk> chunks = new ArrayList<>();
        int order = 0;
        for (Section section : sections) {
            List<String> bodies = splitBodies(section.body());
            for (String body : bodies) {
                String headingTrail = section.headingTrail();
                String chunkTitle = headingTrail.isBlank() ? normalizedTitle : headingTrail;
                String chunkContent = chunkTitle + "\n" + body.trim();
                chunks.add(new WikiChunk(
                        chunkId(pageType, pageId, versionNumber, order),
                        order,
                        chunkTitle,
                        normalizedPath,
                        chunkContent.trim(),
                        body.trim(),
                        countChars(body)
                ));
                order++;
            }
        }
        return chunks.isEmpty()
                ? List.of(new WikiChunk(chunkId(pageType, pageId, versionNumber, 0), 0, normalizedTitle, normalizedPath, normalizedTitle, normalizedTitle, countChars(normalizedTitle)))
                : List.copyOf(chunks);
    }

    private List<Section> splitSections(String title, String content) {
        List<Section> sections = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        String currentHeading = defaultString(title);
        for (String rawLine : content.split("\\r?\\n")) {
            String line = rawLine == null ? "" : rawLine;
            if (isHeading(line)) {
                flushSection(sections, currentHeading, current);
                currentHeading = line.replaceFirst("^#+\\s*", "").trim();
                continue;
            }
            current.append(line).append('\n');
        }
        flushSection(sections, currentHeading, current);
        return sections.isEmpty() ? List.of(new Section(defaultString(title), content)) : List.copyOf(sections);
    }

    private void flushSection(List<Section> sections, String heading, StringBuilder body) {
        String normalizedBody = body.toString().trim();
        if (!normalizedBody.isBlank()) {
            sections.add(new Section(defaultString(heading), normalizedBody));
        }
        body.setLength(0);
    }

    private List<String> splitBodies(String body) {
        String normalized = defaultString(body);
        if (normalized.length() <= MAX_CHARS_PER_CHUNK) {
            return List.of(normalized);
        }
        List<String> parts = new ArrayList<>();
        int start = 0;
        while (start < normalized.length()) {
            int end = Math.min(normalized.length(), start + TARGET_CHARS_PER_CHUNK);
            if (end < normalized.length()) {
                int newline = normalized.lastIndexOf('\n', Math.min(end, normalized.length() - 1));
                if (newline > start + 200) {
                    end = newline;
                }
            }
            String part = normalized.substring(start, end).trim();
            if (!part.isBlank()) {
                parts.add(part);
            }
            if (end >= normalized.length()) {
                break;
            }
            start = Math.max(start + 1, end - OVERLAP_CHARS);
        }
        return parts.isEmpty() ? List.of(normalized) : List.copyOf(parts);
    }

    private boolean isHeading(String line) {
        return line != null && line.trim().matches("^#{1,6}\\s+.+$");
    }

    private String chunkId(String pageType, Long pageId, Integer versionNumber, int order) {
        return defaultString(pageType)
                + ":"
                + (pageId == null ? "" : pageId)
                + ":"
                + (versionNumber == null ? "" : versionNumber)
                + ":"
                + order;
    }

    private int countChars(String value) {
        return defaultString(value).length();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private record Section(String headingTrail, String body) {
    }

    /**
     * 切块结果。
     */
    public record WikiChunk(
            String chunkId,
            int chunkOrder,
            String sectionTitle,
            String path,
            String content,
            String plainText,
            int tokenCount
    ) {
    }
}
