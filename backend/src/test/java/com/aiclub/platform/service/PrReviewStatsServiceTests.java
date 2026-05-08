package com.aiclub.platform.service;

import com.aiclub.platform.dto.PrReviewStatsConfigSummary;
import com.aiclub.platform.dto.PrReviewStatsSummary;
import com.aiclub.platform.dto.request.PrReviewStatsQueryRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PrReviewStatsServiceTests {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private PrReviewStatsService prReviewStatsService;

    @BeforeEach
    void setUp() {
        prReviewStatsService = new PrReviewStatsService(
                new ObjectMapper(),
                buildProperties(),
                httpClient
        );
    }

    @Test
    void shouldReturnDefaultConfigAndDecodeGroupName() throws Exception {
        mockResponses(List.of("""
                {"code":200,"data":[{"id":16395347,"name":"çæé¥æäºä¸é¨-äº§åä¸­å¿"}],"msg":null}
                """));

        PrReviewStatsConfigSummary config = prReviewStatsService.getDefaultConfig(
                "2026-04-01 00:00:00",
                "2026-04-30 23:59:59"
        );

        assertThat(config.defaultToken()).isEqualTo("default-token");
        assertThat(config.defaultUserId()).isEqualTo("mani");
        assertThat(config.groups()).hasSize(1);
        assertThat(config.groups().get(0).name()).isEqualTo("生态遥感事业部-产品中心");
    }

    @Test
    void shouldCalculateRejectRateAndPendingIssueSuggestion() throws Exception {
        mockResponses(List.of(
                """
                {"code":200,"data":[
                  {"id":1,"ident":"IJ100","title":"å¾åå¹¶ä»»å¡","issue_type":"å¼åä»»å¡","assignee_remark":"å¼ ä¸","dev_content":"","pr_state":"opened","project_name":"é¡¹ç®A","pr_title":"MR-A"},
                  {"id":2,"ident":"IJ200","title":"å·²åå¹¶ä»»å¡","issue_type":"å¼åä»»å¡","assignee_remark":"æå","dev_content":"","pr_state":"merged","project_name":"é¡¹ç®B","pr_title":"MR-B"},
                  {"id":3,"ident":"IJ300","title":"ç¼ºé·ä»»å¡","issue_type":"ç¼ºé·","assignee_remark":"æå","dev_content":"","pr_state":"merged","project_name":"é¡¹ç®C","pr_title":"MR-C"}
                ],"msg":null}
                """,
                """
                {"code":200,"data":[
                  {"id":11,"state":"closed","memo":"[[IJ100]]","title":"MR-A"},
                  {"id":12,"state":"merged","memo":"[[IJ200]]","title":"MR-B"},
                  {"id":13,"state":"opened","memo":"[[IJ400]]","title":"MR-C"},
                  {"id":14,"state":"closed","memo":"[[IJ500]]","title":"MR-D"}
                ],"msg":null}
                """
        ));

        PrReviewStatsSummary summary = prReviewStatsService.queryStats(new PrReviewStatsQueryRequest(
                "2026-04-01 00:00:00",
                "2026-04-30 23:59:59",
                "mani",
                "test-token",
                16395347L,
                "生态遥感事业部-产品中心"
        ));

        assertThat(summary.totalPrCount()).isEqualTo(4);
        assertThat(summary.closedPrCount()).isEqualTo(2);
        assertThat(summary.rejectRate()).isEqualTo(50.0);
        assertThat(summary.rejectRateQualified()).isTrue();
        assertThat(summary.allMerged()).isFalse();
        assertThat(summary.unmergedDevelopmentCount()).isEqualTo(1);
        assertThat(summary.issueBracketSuggestion()).isEqualTo("[[IJ100]]");
        assertThat(summary.pendingTaskGroups()).hasSize(1);
        assertThat(summary.pendingTaskGroups().get(0).assigneeRemark()).isEqualTo("张三");
        assertThat(summary.pendingTaskGroups().get(0).tasks().get(0).title()).isEqualTo("待合并任务");
        assertThat(summary.summaryMarkdown()).contains("打回率:50.00%");
    }

    @Test
    void shouldPassHeadersWhenCallingOa() throws Exception {
        mockResponses(List.of(
                """
                {"code":200,"data":[],"msg":null}
                """,
                """
                {"code":200,"data":[],"msg":null}
                """
        ));

        prReviewStatsService.queryStats(new PrReviewStatsQueryRequest(
                "2026-04-01 00:00:00",
                "2026-04-30 23:59:59",
                "mani",
                "test-token",
                16395347L,
                "生态遥感事业部-产品中心"
        ));

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        List<HttpRequest> requests = requestCaptor.getAllValues();
        assertThat(requests.get(0).headers().firstValue("Qw-user-id")).contains("mani");
        assertThat(requests.get(0).headers().firstValue("Qw-token")).contains("test-token");
        assertThat(requests.get(1).uri().toString()).contains("dev_group_id=16395347");
    }

    @Test
    void shouldExpandDayRangeToFullDayWhenQueryUsesDateOnly() throws Exception {
        mockResponses(List.of(
                """
                {"code":200,"data":[],"msg":null}
                """,
                """
                {"code":200,"data":[],"msg":null}
                """
        ));

        prReviewStatsService.queryStats(new PrReviewStatsQueryRequest(
                "2026-04-01",
                "2026-04-30",
                "mani",
                "test-token",
                16395347L,
                "生态遥感事业部-产品中心"
        ));

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2)).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        List<HttpRequest> requests = requestCaptor.getAllValues();
        assertThat(requests.get(0).uri().toString()).contains("start_time=2026-04-01+00%3A00%3A00");
        assertThat(requests.get(0).uri().toString()).contains("end_time=2026-04-30+23%3A59%3A59");
        assertThat(requests.get(1).uri().toString()).contains("start_time=2026-04-01+00%3A00%3A00");
        assertThat(requests.get(1).uri().toString()).contains("end_time=2026-04-30+23%3A59%3A59");
    }

    private void mockResponses(List<String> responseBodies) throws Exception {
        ArrayList<String> queue = new ArrayList<>(responseBodies);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenAnswer(invocation -> queue.remove(0));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
    }

    private PrReviewStatsProperties buildProperties() {
        PrReviewStatsProperties properties = new PrReviewStatsProperties();
        properties.setOaBaseUrl("http://192.168.110.251:8082");
        properties.setDefaultToken("default-token");
        properties.setDefaultUserId("mani");
        properties.setDefaultDevGroupName("生态遥感事业部-产品中心");
        return properties;
    }
}
