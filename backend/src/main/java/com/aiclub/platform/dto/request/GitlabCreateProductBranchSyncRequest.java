package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record GitlabCreateProductBranchSyncRequest(
        @NotEmpty(message = "至少选择一个产品分线")
        List<Long> productBranchIds
) {
}
