package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SystemAnnouncementRequest(
        @NotBlank @Size(max = 200) String title,
        @NotBlank @Size(max = 5000) String content,
        @Size(max = 300) String actionUrl,
        @Size(max = 20) String level,
        List<Long> recipientUserIds
) {
}
