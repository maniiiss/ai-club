package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.HermesConversationAttachmentEntity;
import com.aiclub.platform.domain.model.HermesConversationMessageEntity;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.HermesAttachmentSummary;
import com.aiclub.platform.repository.HermesConversationAttachmentRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * Hermes 会话附件服务，统一负责上传、转换、绑定和历史回显。
 */
@Service
@Transactional(readOnly = true)
public class HermesAttachmentService {

    /** Hermes 时间格式与其它会话 DTO 保持一致。 */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DocumentAssetService documentAssetService;
    private final DocumentMarkdownService documentMarkdownService;
    private final HermesConversationAttachmentRepository hermesConversationAttachmentRepository;
    private final ObjectMapper objectMapper;

    public HermesAttachmentService(DocumentAssetService documentAssetService,
                                   DocumentMarkdownService documentMarkdownService,
                                   HermesConversationAttachmentRepository hermesConversationAttachmentRepository,
                                   ObjectMapper objectMapper) {
        this.documentAssetService = documentAssetService;
        this.documentMarkdownService = documentMarkdownService;
        this.hermesConversationAttachmentRepository = hermesConversationAttachmentRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 上传本轮附件并同步转换为 Markdown。
     */
    @Transactional
    public List<PreparedAttachment> uploadAndConvert(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            return List.of();
        }
        return files.stream()
                .map(file -> {
                    DocumentAssetSummary asset = documentAssetService.uploadAsset(file, "hermes-attachments");
                    DocumentAssetEntity entity = documentAssetService.requireAccessibleAsset(asset.id());
                    DocumentMarkdownResult converted = documentMarkdownService.convert(
                            asset.id(),
                            DocumentMarkdownService.SCENE_HERMES_ATTACHMENT,
                            15000
                    );
                    return new PreparedAttachment(entity, converted);
                })
                .toList();
    }

    /**
     * 把已转换的附件挂到指定用户消息上。
     */
    @Transactional
    public List<HermesConversationAttachmentEntity> bindToUserMessage(HermesConversationMessageEntity message,
                                                                      List<PreparedAttachment> attachments) {
        if (message == null || attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        return attachments.stream()
                .map(attachment -> {
                    HermesConversationAttachmentEntity entity = new HermesConversationAttachmentEntity();
                    entity.setMessage(message);
                    entity.setDocumentAsset(documentAssetService.bindAsset(
                            attachment.asset(),
                            DocumentAssetService.BIZ_TYPE_HERMES_ATTACHMENT,
                            message.getId()
                    ));
                    entity.setSuggestedTitle(attachment.converted().suggestedTitle());
                    entity.setMarkdown(attachment.converted().markdown());
                    entity.setTruncated(attachment.converted().truncated());
                    entity.setWarningsJson(writeWarnings(attachment.converted().warnings()));
                    return hermesConversationAttachmentRepository.save(entity);
                })
                .toList();
    }

    /**
     * 把消息列表关联的附件分组，供会话详情一次回显。
     */
    public Map<Long, List<HermesAttachmentSummary>> loadMessageAttachments(List<Long> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) {
            return Map.of();
        }
        return hermesConversationAttachmentRepository.findAllByMessage_IdIn(messageIds).stream()
                .collect(Collectors.groupingBy(
                        attachment -> attachment.getMessage().getId(),
                        LinkedHashMap::new,
                        Collectors.mapping(this::toSummary, Collectors.toList())
                ));
    }

    /**
     * 读取会话最近一条用户消息上的附件，供后续无附件追问时继续沿用上下文。
     */
    public List<HermesConversationAttachmentEntity> findRecentAttachments(Long sessionId) {
        if (sessionId == null) {
            return List.of();
        }
        List<HermesConversationAttachmentEntity> all = hermesConversationAttachmentRepository.findRecentUserAttachments(sessionId);
        if (all.isEmpty()) {
            return List.of();
        }
        Long latestMessageId = all.get(0).getMessage().getId();
        return all.stream()
                .filter(item -> item.getMessage() != null && latestMessageId.equals(item.getMessage().getId()))
                .toList();
    }

    /**
     * 按会话读取当前用户可下载的附件记录。
     */
    public HermesConversationAttachmentEntity requireOwnedAttachment(Long sessionId, Long attachmentId) {
        Long currentUserId = documentAssetService.requireAccessibleAsset(
                hermesConversationAttachmentRepository.findById(attachmentId)
                        .map(item -> item.getDocumentAsset().getId())
                        .orElseThrow(() -> new NoSuchElementException("Hermes 附件不存在"))
        ).getOwnerUser().getId();
        return hermesConversationAttachmentRepository.findByIdAndMessage_Session_IdAndMessage_Session_User_Id(attachmentId, sessionId, currentUserId)
                .orElseThrow(() -> new NoSuchElementException("Hermes 附件不存在"));
    }

    /**
     * 将附件列表拼成注入模型的上下文说明。
     */
    public String buildAttachmentContextMarkdown(List<HermesConversationAttachmentEntity> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("## 最近一轮可用附件\n");
        int index = 1;
        for (HermesConversationAttachmentEntity attachment : attachments) {
            appendAttachmentMarkdown(
                    builder,
                    index++,
                    attachment.getDocumentAsset(),
                    attachment.getSuggestedTitle(),
                    attachment.getMarkdown(),
                    attachment.isTruncated(),
                    readWarnings(attachment.getWarningsJson())
            );
        }
        return builder.toString().trim();
    }

    /**
     * 将本轮新上传附件拼成注入模型的上下文说明。
     */
    public String buildPreparedAttachmentContextMarkdown(List<PreparedAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("## 本轮上传附件\n");
        int index = 1;
        for (PreparedAttachment attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            appendAttachmentMarkdown(
                    builder,
                    index++,
                    attachment.asset(),
                    attachment.converted() == null ? "" : attachment.converted().suggestedTitle(),
                    attachment.converted() == null ? "" : attachment.converted().markdown(),
                    attachment.converted() != null && attachment.converted().truncated(),
                    attachment.converted() == null ? List.of() : attachment.converted().warnings()
            );
        }
        return builder.toString().trim();
    }

    private HermesAttachmentSummary toSummary(HermesConversationAttachmentEntity entity) {
        DocumentAssetEntity asset = entity.getDocumentAsset();
        return new HermesAttachmentSummary(
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

    /**
     * 统一输出附件元信息和提取后的 Markdown，确保 Hermes 能直接消费文档正文。
     */
    private void appendAttachmentMarkdown(StringBuilder builder,
                                          int index,
                                          DocumentAssetEntity asset,
                                          String suggestedTitle,
                                          String markdown,
                                          boolean truncated,
                                          List<String> warnings) {
        if (asset == null) {
            return;
        }
        builder.append("### 附件 ").append(index).append('\n')
                .append("- assetId：").append(asset.getId())
                .append(" / 文件：").append(defaultString(asset.getFileName()))
                .append(" / 格式：").append(defaultString(asset.getSourceFormat()))
                .append(" / 大小：").append(asset.getFileSize()).append(" 字节")
                .append('\n');
        if (hasText(suggestedTitle)) {
            builder.append("- 建议标题：").append(defaultString(suggestedTitle)).append('\n');
        }
        if (truncated) {
            builder.append("- 转换说明：文档内容因长度限制已截断\n");
        }
        if (warnings != null && !warnings.isEmpty()) {
            builder.append("- 转换警告：").append(String.join("；", warnings)).append('\n');
        }
        String normalizedMarkdown = defaultString(markdown);
        if (normalizedMarkdown.isBlank()) {
            builder.append("- 提取结果：未提取到有效 Markdown 内容\n\n");
            return;
        }
        builder.append("以下是从该附件提取出的 Markdown 正文，请优先基于这些内容回答：\n")
                .append("```markdown\n")
                .append(normalizedMarkdown)
                .append("\n```\n\n");
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * 本轮待绑定附件的临时对象。
     */
    public record PreparedAttachment(
            DocumentAssetEntity asset,
            DocumentMarkdownResult converted
    ) {
    }
}
