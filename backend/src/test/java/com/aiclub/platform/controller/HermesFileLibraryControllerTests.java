package com.aiclub.platform.controller;

import com.aiclub.platform.dto.HermesFileLibraryItemSummary;
import com.aiclub.platform.dto.request.UpdateHermesFileLibraryItemRequest;
import com.aiclub.platform.service.HermesFileLibraryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

/**
 * 验证 Hermes 个人文件库控制器在不同 HTTP 方法下的更新兼容性。
 */
class HermesFileLibraryControllerTests {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldUpdateFileLibraryItemByPutForPatchCompatibility() throws Exception {
        HermesFileLibraryService service = mock(HermesFileLibraryService.class);
        MockMvc mockMvc = standaloneSetup(new HermesFileLibraryController(service)).build();
        HermesFileLibraryItemSummary summary = new HermesFileLibraryItemSummary(
                77L,
                101L,
                "2025年述职报告.docx",
                "2025年述职报告",
                "年度工作复盘",
                "DOCX",
                1024L,
                false,
                "INDEXED",
                List.of(),
                "",
                "2026-07-06 10:00:00",
                "2026-07-06 10:05:00"
        );
        when(service.update(eq(77L), org.mockito.ArgumentMatchers.any(UpdateHermesFileLibraryItemRequest.class)))
                .thenReturn(summary);

        mockMvc.perform(put("/api/hermes/file-library/77")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateHermesFileLibraryItemRequest(null, null, false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(77))
                .andExpect(jsonPath("$.data.enabled").value(false));

        ArgumentCaptor<UpdateHermesFileLibraryItemRequest> requestCaptor = ArgumentCaptor.forClass(UpdateHermesFileLibraryItemRequest.class);
        verify(service).update(eq(77L), requestCaptor.capture());
        assertThat(requestCaptor.getValue().enabled()).isFalse();
    }
}
