package com.aiclub.platform.dto.request;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Hermes 带附件问答的内部命令对象。
 */
public record HermesMultipartChatCommand(
        String question,
        HermesSelectionRequest selection,
        Boolean debug,
        String slashCommand,
        List<MultipartFile> files
) {
    public HermesMultipartChatCommand {
        files = files == null ? List.of() : List.copyOf(files);
    }

    /**
     * 兼容旧调用方：未提供 Slash 命令时不启用业务 Skill。
     */
    public HermesMultipartChatCommand(String question,
                                      HermesSelectionRequest selection,
                                      Boolean debug,
                                      List<MultipartFile> files) {
        this(question, selection, debug, null, files);
    }
}
