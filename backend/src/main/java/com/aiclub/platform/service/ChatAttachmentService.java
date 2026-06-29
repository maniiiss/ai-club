package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageAttachmentEntity;
import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.dto.ChatAttachmentSummary;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.repository.ChatMessageAttachmentRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 聊天室附件服务。
 * 业务意图：复用平台文件资产和文档转 Markdown 能力，但以聊天室消息为新的业务绑定对象。
 */
@Service
@Transactional(readOnly = true)
public class ChatAttachmentService {

    public static final String BIZ_TYPE_CHAT_ATTACHMENT = "CHAT_ATTACHMENT";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DocumentAssetService documentAssetService;
    private final DocumentMarkdownService documentMarkdownService;
    private final ChatMessageAttachmentRepository chatMessageAttachmentRepository;
    private final ObjectMapper objectMapper;

    public ChatAttachmentService(DocumentAssetService documentAssetService,
                                 DocumentMarkdownService documentMarkdownService,
                                 ChatMessageAttachmentRepository chatMessageAttachmentRepository,
                                 ObjectMapper objectMapper) {
        this.documentAssetService = documentAssetService;
        this.documentMarkdownService = documentMarkdownService;
        this.chatMessageAttachmentRepository = chatMessageAttachmentRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public List<ChatMessageAttachmentEntity> bindUploads(ChatMessageEntity message, List<MultipartFile> files) {
        if (message == null || files == null || files.isEmpty()) {
            return List.of();
        }
        return files.stream()
                .map(file -> {
                    DocumentAssetSummary asset = documentAssetService.uploadAsset(file, "chat-attachments");
                    DocumentAssetEntity entity = documentAssetService.requireAccessibleAsset(asset.id());
                    DocumentMarkdownResult converted = documentMarkdownService.convert(asset.id(), "CHAT_ATTACHMENT", 15000);
                    return saveAttachment(message, entity, converted);
                })
                .toList();
    }

    @Transactional
    public List<ChatMessageAttachmentEntity> bindExistingAssets(ChatMessageEntity message, List<Long> assetIds) {
        if (message == null || assetIds == null || assetIds.isEmpty()) {
            return List.of();
        }
        return assetIds.stream()
                .map(assetId -> {
                    DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(assetId);
                    DocumentMarkdownResult converted = documentMarkdownService.convert(assetId, "CHAT_ATTACHMENT", 15000);
                    return saveAttachment(message, asset, converted);
                })
                .toList();
    }

    public Map<Long, List<ChatAttachmentSummary>> loadMessageAttachments(List<Long> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) {
            return Map.of();
        }
        return chatMessageAttachmentRepository.findAllByMessage_IdIn(messageIds).stream()
                .collect(Collectors.groupingBy(
                        attachment -> attachment.getMessage().getId(),
                        LinkedHashMap::new,
                        Collectors.mapping(this::toSummary, Collectors.toList())
                ));
    }

    public String buildRoomAttachmentContextMarkdown(Long roomId) {
        List<ChatMessageAttachmentEntity> attachments = chatMessageAttachmentRepository.findAllByMessage_Room_IdOrderByCreatedAtDescIdDesc(roomId);
        if (attachments.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("## 房间附件摘录\n");
        int index = 1;
        for (ChatMessageAttachmentEntity attachment : attachments.stream().limit(8).toList()) {
            builder.append("### 附件 ").append(index++).append("：")
                    .append(defaultString(attachment.getSuggestedTitle()))
                    .append('\n')
                    .append(defaultString(attachment.getMarkdown()))
                    .append("\n\n");
        }
        return builder.toString().trim();
    }

    private ChatMessageAttachmentEntity saveAttachment(ChatMessageEntity message, DocumentAssetEntity asset, DocumentMarkdownResult converted) {
        ChatMessageAttachmentEntity attachment = new ChatMessageAttachmentEntity();
        attachment.setMessage(message);
        attachment.setDocumentAsset(documentAssetService.bindAsset(asset, BIZ_TYPE_CHAT_ATTACHMENT, message.getId()));
        attachment.setSuggestedTitle(converted == null ? asset.getFileName() : converted.suggestedTitle());
        attachment.setMarkdown(converted == null ? "" : converted.markdown());
        attachment.setTruncated(converted != null && converted.truncated());
        attachment.setWarningsJson(writeWarnings(converted == null ? List.of() : converted.warnings()));
        return chatMessageAttachmentRepository.save(attachment);
    }

    private ChatAttachmentSummary toSummary(ChatMessageAttachmentEntity entity) {
        DocumentAssetEntity asset = entity.getDocumentAsset();
        return new ChatAttachmentSummary(
                entity.getId(),
                asset.getId(),
                defaultString(asset.getFileName()),
                defaultString(asset.getContentType()),
                asset.getFileSize(),
                defaultString(asset.getSourceFormat()),
                defaultString(entity.getSuggestedTitle()),
                entity.isTruncated(),
                readWarnings(entity.getWarningsJson()),
                entity.getCreatedAt() == null ? null : TIME_FORMATTER.format(entity.getCreatedAt())
        );
    }

    private String writeWarnings(List<String> warnings) {
        try {
            return objectMapper.writeValueAsString(warnings == null ? List.of() : warnings);
        } catch (JsonProcessingException exception) {
            return "[]";
        }
    }

    private List<String> readWarnings(String warningsJson) {
        try {
            if (warningsJson == null || warningsJson.isBlank()) {
                return List.of();
            }
            return objectMapper.readerForListOf(String.class).readValue(warningsJson);
        } catch (Exception exception) {
            return List.of();
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
