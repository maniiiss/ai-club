package com.aiclub.platform.controller;

import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestItem;
import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.ModelUsageIngestService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 锁定内部用量回传端点的鉴权与委托：必须先校验共享 Bearer Token 再落账，
 * 未授权时不得触发落账。
 */
@ExtendWith(MockitoExtension.class)
class InternalModelUsageControllerTests {

    @Mock
    private InternalServiceAuthenticator internalServiceAuthenticator;

    @Mock
    private ModelUsageIngestService modelUsageIngestService;

    @Mock
    private HttpServletRequest servletRequest;

    private InternalModelUsageController controller() {
        return new InternalModelUsageController(internalServiceAuthenticator, modelUsageIngestService);
    }

    private ModelUsageIngestRequest request(int count) {
        List<ModelUsageIngestItem> events = java.util.stream.IntStream.range(0, count)
                .mapToObj(i -> new ModelUsageIngestItem(
                        "k" + i, "CODE_REVIEW", "OPENAI", "gpt-4o", null, 1L, null, (long) i, null,
                        10, 5, 15, null, 100L, "SUCCESS", null))
                .toList();
        return new ModelUsageIngestRequest(events);
    }

    @Test
    void shouldAuthorizeThenIngestAndReturnAcceptedCount() {
        InternalModelUsageController controller = controller();
        when(servletRequest.getRemoteAddr()).thenReturn("127.0.0.1");
        when(modelUsageIngestService.ingest(any())).thenReturn(2);

        var result = controller.ingestEvents("Bearer token", servletRequest, request(2));

        verify(internalServiceAuthenticator).requireAuthorized(eq("Bearer token"), eq("127.0.0.1"));
        ArgumentCaptor<List<ModelUsageIngestItem>> captor = ArgumentCaptor.forClass(List.class);
        verify(modelUsageIngestService).ingest(captor.capture());
        assertThat(captor.getValue()).hasSize(2);
        assertThat(result).containsEntry("status", "accepted").containsEntry("accepted", 2);
    }

    @Test
    void shouldNotIngestWhenUnauthorized() {
        InternalModelUsageController controller = controller();
        when(servletRequest.getRemoteAddr()).thenReturn("10.0.0.1");
        doThrow(new UnauthorizedException("内部服务认证失败"))
                .when(internalServiceAuthenticator).requireAuthorized(eq("Bearer wrong"), eq("10.0.0.1"));

        assertThatThrownBy(() -> controller.ingestEvents("Bearer wrong", servletRequest, request(1)))
                .isInstanceOf(UnauthorizedException.class);

        verify(modelUsageIngestService, never()).ingest(any());
    }
}
