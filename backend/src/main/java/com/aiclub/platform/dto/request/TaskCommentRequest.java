package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

public record TaskCommentRequest(
        @Size(max = 20000, message = "评论内容长度不能超过20000")
        String content
) {
}
