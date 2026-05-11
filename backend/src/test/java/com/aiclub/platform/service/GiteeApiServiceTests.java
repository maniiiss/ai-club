package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GiteeApiServiceTests {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private GiteeApiService giteeApiService;

    @BeforeEach
    void setUp() {
        giteeApiService = new GiteeApiService(new ObjectMapper(), httpClient);
    }

    @Test
    void shouldNormalizeSwaggerUrlAndParseWrappedPrograms() throws Exception {
        mockSuccessResponse("""
                {
                  "programs": [
                    {
                      "id": 1001,
                      "name": "Agent Ops",
                      "ident": "agent-ops"
                    }
                  ]
                }
                """);

        List<GiteeApiService.GiteeProgram> programs = giteeApiService.listPrograms(
                "https://gitee.com/api/v8/swagger#/getEnterpriseIdPrograms",
                "plain-token",
                4856171L
        );

        assertThat(programs).hasSize(1);
        assertThat(programs.get(0).id()).isEqualTo(1001L);
        assertThat(programs.get(0).name()).isEqualTo("Agent Ops");
        assertThat(programs.get(0).ident()).isEqualTo("agent-ops");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        String requestUrl = requestCaptor.getValue().uri().toString();
        assertThat(requestUrl).startsWith("https://api.gitee.com/enterprises/4856171/programs?");
        assertThat(requestUrl).contains("access_token=plain-token");
        assertThat(requestUrl).contains("page=1");
        assertThat(requestUrl).contains("per_page=100");
    }

    @Test
    void shouldListMembersWithSearchKeywordAndParseNestedUserSnapshot() throws Exception {
        mockSuccessResponse("""
                {
                  "data": [
                    {
                      "id": 991,
                      "username": "zhangsan",
                      "remark": "张三",
                      "email": "zhangsan@example.com",
                      "user": {
                        "id": 1991,
                        "username": "zhangsan",
                        "name": "张三用户",
                        "avatar_url": "https://gitee.com/avatar/zhangsan.png"
                      }
                    }
                  ]
                }
                """);

        List<GiteeApiService.GiteeMember> members = giteeApiService.listMembers(
                "https://gitee.com/api/v8/swagger#/getEnterpriseIdMembers",
                "plain-token",
                4856171L,
                "张三"
        );

        assertThat(members).hasSize(1);
        assertThat(members.get(0).id()).isEqualTo(991L);
        assertThat(members.get(0).username()).isEqualTo("zhangsan");
        assertThat(members.get(0).name()).isEqualTo("张三");
        assertThat(members.get(0).email()).isEqualTo("zhangsan@example.com");
        assertThat(members.get(0).avatarUrl()).isEqualTo("https://gitee.com/avatar/zhangsan.png");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        String requestUrl = requestCaptor.getValue().uri().toString();
        assertThat(requestUrl).startsWith("https://api.gitee.com/enterprises/4856171/members?");
        assertThat(requestUrl).contains("access_token=plain-token");
        assertThat(requestUrl).contains("search=%E5%BC%A0%E4%B8%89");
        assertThat(requestUrl).contains("page=1");
        assertThat(requestUrl).contains("per_page=100");
    }

    @Test
    void shouldFailFastWhenProgramsPayloadDoesNotContainListField() throws Exception {
        mockSuccessResponse("""
                {
                  "message": "ok"
                }
                """);

        assertThatThrownBy(() -> giteeApiService.listPrograms(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L
        )).isInstanceOf(IllegalStateException.class)
                .hasMessage("Gitee 接口返回格式不符合预期，未找到列表字段");
    }

    @Test
    void shouldFlattenGroupedMilestonesResponse() throws Exception {
        mockSuccessResponse("""
                {
                  "active": [
                    {
                      "id": 5001,
                      "title": "迭代一",
                      "state": "open",
                      "start_date": "2026-04-01",
                      "due_date": "2026-04-10"
                    }
                  ],
                  "closed": [
                    {
                      "id": 5002,
                      "title": "迭代二",
                      "state": "closed",
                      "start_date": "2026-03-01",
                      "due_date": "2026-03-10"
                    }
                  ]
                }
                """);

        List<GiteeApiService.GiteeMilestone> milestones = giteeApiService.listMilestones(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                1001L
        );

        assertThat(milestones).hasSize(2);
        assertThat(milestones.get(0).title()).isEqualTo("迭代一");
        assertThat(milestones.get(1).title()).isEqualTo("迭代二");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        String requestUrl = requestCaptor.getValue().uri().toString();
        assertThat(requestUrl).startsWith("https://api.gitee.com/enterprises/4856171/programs/1001/scrum_sprints?");
        assertThat(requestUrl).contains("page=1");
        assertThat(requestUrl).contains("offset=0");
        assertThat(requestUrl).contains("per_page=20");
    }

    @Test
    void shouldUseScrumSprintIdsWhenListingIssues() throws Exception {
        mockSuccessResponse("""
                {
                  "issues": [
                    {
                      "id": 9001,
                      "title": "远端任务",
                      "content": "同步描述",
                      "state": "open",
                      "priority": 0,
                      "priority_human": "P0"
                    }
                  ]
                }
                """);

        List<GiteeApiService.GiteeIssue> issues = giteeApiService.listIssues(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                1001L,
                5001L
        );

        assertThat(issues).hasSize(1);
        assertThat(issues.get(0).title()).isEqualTo("远端任务");
        assertThat(issues.get(0).description()).isEqualTo("同步描述");
        assertThat(issues.get(0).priority()).isEqualTo("P0");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        String requestUrl = requestCaptor.getValue().uri().toString();
        assertThat(requestUrl).startsWith("https://api.gitee.com/enterprises/4856171/issues?");
        assertThat(requestUrl).contains("program_id=1001");
        assertThat(requestUrl).contains("scrum_sprint_ids=5001");
    }

    @Test
    void shouldParseIssueAssigneeAndCreatorSnapshotsSeparately() throws Exception {
        mockSuccessResponse("""
                {
                  "issues": [
                    {
                      "id": 9002,
                      "title": "远端任务",
                      "content": "同步描述",
                      "assignee": {
                        "id": 701,
                        "username": "gitee_assignee",
                        "name": "远端负责人"
                      },
                      "user": {
                        "id": 801,
                        "username": "gitee_creator",
                        "name": "远端创建人"
                      }
                    },
                    {
                      "id": 9003,
                      "title": "只有创建人的任务",
                      "content": "同步描述",
                      "user": {
                        "id": 802,
                        "username": "creator_only",
                        "name": "仅创建人"
                      }
                    }
                  ]
                }
                """);

        List<GiteeApiService.GiteeIssue> issues = giteeApiService.listIssues(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                1001L,
                5001L
        );

        assertThat(issues).hasSize(2);
        assertThat(issues.get(0).assigneeName()).isEqualTo("远端负责人");
        assertThat(issues.get(0).assigneeMemberId()).isEqualTo(701L);
        assertThat(issues.get(0).assigneeUsername()).isEqualTo("gitee_assignee");
        assertThat(issues.get(0).creatorMemberId()).isEqualTo(801L);
        assertThat(issues.get(0).creatorUsername()).isEqualTo("gitee_creator");
        assertThat(issues.get(1).assigneeName()).isEmpty();
        assertThat(issues.get(1).creatorMemberId()).isEqualTo(802L);
        assertThat(issues.get(1).creatorUsername()).isEqualTo("creator_only");
    }

    @Test
    void shouldParseIssueDetailFromWrappedDataNode() throws Exception {
        mockSuccessResponse("""
                {
                  "data": {
                    "id": 9001,
                    "title": "远端任务",
                    "content": "详情正文",
                    "state": "open",
                    "priority": 3,
                    "priority_human": "P3"
                  }
                }
                """);

        GiteeApiService.GiteeIssue issue = giteeApiService.fetchIssueDetail(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                9001L
        );

        assertThat(issue.id()).isEqualTo(9001L);
        assertThat(issue.title()).isEqualTo("远端任务");
        assertThat(issue.description()).isEqualTo("详情正文");
        assertThat(issue.priority()).isEqualTo("P3");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        String requestUrl = requestCaptor.getValue().uri().toString();
        assertThat(requestUrl).startsWith("https://api.gitee.com/enterprises/4856171/issues/9001?");
    }

    @Test
    void shouldCreateTestPlanWithJsonBodyAndWrappedResponse() throws Exception {
        mockSuccessResponse("""
                {
                  "data": {
                    "id": 321,
                    "title": "远端测试计划"
                  }
                }
                """);

        GiteeApiService.GiteeRemoteTestPlan remoteTestPlan = giteeApiService.createTestPlan(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                new GiteeApiService.GiteeTestPlanRequest(
                        "测试计划A",
                        "sprint",
                        800335L,
                        9917662L,
                        "说明",
                        "2026-04-30T00:00:00+08:00",
                        "2026-05-30T23:59:59+08:00"
                )
        );

        assertThat(remoteTestPlan.id()).isEqualTo(321L);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(request.method()).isEqualTo("POST");
        assertThat(request.uri().toString()).startsWith("https://api.gitee.com/enterprises/4856171/test_plans?");
        assertThat(readRequestBody(request)).contains("\"title\":\"测试计划A\"");
        assertThat(readRequestBody(request)).contains("\"ref_type\":\"sprint\"");
        assertThat(readRequestBody(request)).contains("\"program_id\":800335");
        assertThat(readRequestBody(request)).contains("\"assignee_id\":9917662");
    }

    @Test
    void shouldUpdateTestCaseWithJsonBodyAndRootResponse() throws Exception {
        mockSuccessResponse("""
                {
                  "id": 654,
                  "title": "远端测试用例"
                }
                """);

        GiteeApiService.GiteeRemoteTestCase remoteTestCase = giteeApiService.updateTestCase(
                "https://api.gitee.com/enterprises",
                "plain-token",
                4856171L,
                654L,
                new GiteeApiService.GiteeTestCaseRequest(
                        229413L,
                        2,
                        "用例A",
                        "前置条件",
                        List.of(new GiteeApiService.GiteeTestCaseStepRequest(1, 1, "步骤", "结果")),
                        "备注",
                        List.of(),
                        0,
                        800335L
                )
        );

        assertThat(remoteTestCase.id()).isEqualTo(654L);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(request.method()).isEqualTo("PUT");
        assertThat(request.uri().toString()).startsWith("https://api.gitee.com/enterprises/4856171/test_cases/654?");
        String requestBody = readRequestBody(request);
        assertThat(requestBody).contains("\"module_id\":229413");
        assertThat(requestBody).contains("\"case_type\":2");
        assertThat(requestBody).contains("\"priority\":0");
        assertThat(requestBody).contains("\"case_steps\":[");
    }

    private void mockSuccessResponse(String body) throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(body);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
    }

    private String readRequestBody(HttpRequest request) throws Exception {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        CountDownLatch latch = new CountDownLatch(1);
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                outputStream.write(bytes, 0, bytes.length);
            }

            @Override
            public void onError(Throwable throwable) {
                latch.countDown();
            }

            @Override
            public void onComplete() {
                latch.countDown();
            }
        });
        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        return outputStream.toString(StandardCharsets.UTF_8);
    }
}
