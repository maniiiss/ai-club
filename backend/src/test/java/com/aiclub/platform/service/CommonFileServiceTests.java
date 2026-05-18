package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 验证通用文件服务对历史 Markdown 图片直链的兼容响应。
 */
@ExtendWith(MockitoExtension.class)
class CommonFileServiceTests {

    @Mock
    private DocumentAssetService documentAssetService;

    @Mock
    private TaskCommentImageStorageService legacyPublicImageStorageService;

    @Test
    void shouldDownloadLegacyCommentImageAsPublicImageResponse() {
        CommonFileService service = new CommonFileService(documentAssetService, legacyPublicImageStorageService);
        String objectKey = "wiki-spaces/space-1/imports/asset-7/2026/05/17/demo.png";
        byte[] imageBytes = new byte[] {1, 2, 3};

        when(legacyPublicImageStorageService.load(objectKey))
                .thenReturn(new TaskCommentImageStorageService.StoredCommentImageContent(imageBytes, "image/png"));

        ResponseEntity<byte[]> response = service.downloadLegacyPublicImage(objectKey);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
        assertThat(response.getHeaders().getCacheControl()).contains("public");
        assertThat(response.getBody()).containsExactly(imageBytes);
    }
}
