package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

import java.util.List;

/** 更新用户新手引导完成状态请求。 */
public class UpdateGuideStatusRequest {

    @NotNull
    private List<String> pageKeys;

    public UpdateGuideStatusRequest() {
    }

    public List<String> getPageKeys() {
        return pageKeys;
    }

    public void setPageKeys(List<String> pageKeys) {
        this.pageKeys = pageKeys;
    }
}
