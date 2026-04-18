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
        List<MultipartFile> files
) {
    public HermesMultipartChatCommand {
        files = files == null ? List.of() : List.copyOf(files);
    }
}
