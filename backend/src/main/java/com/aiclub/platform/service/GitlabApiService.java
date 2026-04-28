package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 统一封装 GitLab REST API 调用，兼容项目级 PRIVATE-TOKEN 与用户级 Bearer token。
 */
@Service
public class GitlabApiService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GitlabApiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public GitlabUser fetchCurrentUser(String apiBaseUrl, String token) {
        return fetchCurrentUser(apiBaseUrl, GitlabAuthorization.privateToken(token));
    }

    /**
     * 使用指定鉴权方式读取 GitLab 当前用户信息。
     */
    public GitlabUser fetchCurrentUser(String apiBaseUrl, GitlabAuthorization authorization) {
        JsonNode node = sendJsonRequest("GET", normalizeBaseUrl(apiBaseUrl) + "/user", authorization, null, null);
        return new GitlabUser(
                node.path("id").asLong(),
                node.path("username").asText(""),
                node.path("name").asText("")
        );
    }

    public GitlabProject fetchProject(String apiBaseUrl, String token, String projectRef) {
        return fetchProject(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef);
    }

    /**
     * 使用指定鉴权方式读取 GitLab 项目信息。
     */
    public GitlabProject fetchProject(String apiBaseUrl, GitlabAuthorization authorization, String projectRef) {
        String encodedProjectRef = encodeProjectRef(projectRef);
        JsonNode node = sendJsonRequest("GET", normalizeBaseUrl(apiBaseUrl) + "/projects/" + encodedProjectRef, authorization, null, null);
        return new GitlabProject(
                node.path("id").asText(""),
                node.path("name").asText(""),
                node.path("path_with_namespace").asText(projectRef),
                node.path("web_url").asText(""),
                node.path("default_branch").asText(""),
                node.path("http_url_to_repo").asText(""),
                node.path("ssh_url_to_repo").asText("")
        );
    }

    /**
     * 查询仓库分支，供前端远程搜索下拉框使用。
     */
    public List<GitlabBranch> listBranches(String apiBaseUrl, String token, String projectRef, String search) {
        return listBranches(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, search);
    }

    /**
     * 读取单个分支详情，主要用于同步日志记录分支最新提交 SHA。
     */
    public GitlabBranchDetail fetchBranch(String apiBaseUrl, String token, String projectRef, String branchName) {
        return fetchBranch(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, branchName);
    }

    /**
     * 读取单个分支详情，支持项目 token 与用户 Bearer token。
     */
    public GitlabBranchDetail fetchBranch(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, String branchName) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/repository/branches/" + urlEncode(branchName);
        JsonNode node = sendJsonRequest("GET", url, authorization, null, null);
        JsonNode commitNode = node.path("commit");
        return new GitlabBranchDetail(
                node.path("name").asText(""),
                node.path("default").asBoolean(false),
                node.path("protected").asBoolean(false),
                node.path("merged").asBoolean(false),
                node.path("web_url").asText(""),
                commitNode.path("id").asText("")
        );
    }

    /**
     * 查询仓库分支，支持项目级 token 与用户 Bearer token。
     */
    public List<GitlabBranch> listBranches(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, String search) {
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/repository/branches?per_page=100");
        if (hasText(search)) {
            url.append("&search=").append(urlEncode(search.trim()));
        }

        JsonNode arrayNode = sendJsonRequest("GET", url.toString(), authorization, null, null);
        List<GitlabBranch> items = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode node : arrayNode) {
                items.add(new GitlabBranch(
                        node.path("name").asText(""),
                        node.path("default").asBoolean(false),
                        node.path("protected").asBoolean(false),
                        node.path("merged").asBoolean(false),
                        node.path("web_url").asText("")
                ));
            }
        }
        return items;
    }

    public List<GitlabMergeRequest> listMergeRequests(String apiBaseUrl, String token, String projectRef, String state, String targetBranch) {
        return listMergeRequests(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, state, null, targetBranch);
    }

    public List<GitlabMergeRequest> listMergeRequests(String apiBaseUrl,
                                                      String token,
                                                      String projectRef,
                                                      String state,
                                                      String sourceBranch,
                                                      String targetBranch) {
        return listMergeRequests(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, state, sourceBranch, targetBranch);
    }

    /**
     * 查询 Merge Request 列表，支持不同的鉴权请求头。
     */
    public List<GitlabMergeRequest> listMergeRequests(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, String state, String targetBranch) {
        return listMergeRequests(apiBaseUrl, authorization, projectRef, state, null, targetBranch);
    }

    /**
     * 查询 Merge Request 列表，支持同时按源分支与目标分支筛选。
     */
    public List<GitlabMergeRequest> listMergeRequests(String apiBaseUrl,
                                                      GitlabAuthorization authorization,
                                                      String projectRef,
                                                      String state,
                                                      String sourceBranch,
                                                      String targetBranch) {
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/merge_requests?per_page=100&order_by=updated_at&sort=desc&with_merge_status_recheck=true");

        if (hasText(state)) {
            url.append("&state=").append(urlEncode(state));
        }
        if (hasText(sourceBranch)) {
            url.append("&source_branch=").append(urlEncode(sourceBranch));
        }
        if (hasText(targetBranch)) {
            url.append("&target_branch=").append(urlEncode(targetBranch));
        }

        JsonNode arrayNode = sendJsonRequest("GET", url.toString(), authorization, null, null);
        List<GitlabMergeRequest> items = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode node : arrayNode) {
                items.add(toMergeRequest(node));
            }
        }
        return items;
    }

    /**
     * 比较两个分支之间的提交差异，主要用于判断主线是否领先于产品分线。
     */
    public GitlabCompareResult compareBranches(String apiBaseUrl, String token, String projectRef, String fromBranch, String toBranch) {
        return compareBranches(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, fromBranch, toBranch);
    }

    /**
     * 比较两个分支之间的提交差异，支持项目 token 与用户 Bearer token。
     */
    public GitlabCompareResult compareBranches(String apiBaseUrl,
                                               GitlabAuthorization authorization,
                                               String projectRef,
                                               String fromBranch,
                                               String toBranch) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/repository/compare?from=" + urlEncode(fromBranch)
                + "&to=" + urlEncode(toBranch);
        JsonNode node = sendJsonRequest("GET", url, authorization, null, null);
        List<String> commitIds = new ArrayList<>();
        JsonNode commitsNode = node.path("commits");
        if (commitsNode.isArray()) {
            for (JsonNode commitNode : commitsNode) {
                commitIds.add(commitNode.path("id").asText(""));
            }
        }
        return new GitlabCompareResult(
                node.path("compare_same_ref").asBoolean(false),
                node.path("compare_timeout").asBoolean(false),
                commitIds
        );
    }

    public GitlabMergeRequest fetchMergeRequest(String apiBaseUrl, String token, String projectRef, Long mergeRequestIid) {
        return fetchMergeRequest(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, mergeRequestIid);
    }

    /**
     * 获取指定 Merge Request 的完整详情。
     */
    public GitlabMergeRequest fetchMergeRequest(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, Long mergeRequestIid) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid
                + "?include_diverged_commits_count=true&include_rebase_in_progress=true";
        JsonNode node = sendJsonRequest("GET", url, authorization, null, null);
        return toMergeRequest(node);
    }

    public GitlabMergeRequestChanges fetchMergeRequestChanges(String apiBaseUrl, String token, String projectRef, Long mergeRequestIid) {
        return fetchMergeRequestChanges(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, mergeRequestIid);
    }

    /**
     * 拉取 Merge Request 变更详情，供 AI Review 审核使用。
     */
    public GitlabMergeRequestChanges fetchMergeRequestChanges(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, Long mergeRequestIid) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid + "/changes";
        JsonNode node = sendJsonRequest("GET", url, authorization, null, null);
        List<GitlabChange> changes = new ArrayList<>();
        JsonNode changesNode = node.path("changes");
        if (changesNode.isArray()) {
            for (JsonNode changeNode : changesNode) {
                changes.add(new GitlabChange(
                        changeNode.path("old_path").asText(""),
                        changeNode.path("new_path").asText(""),
                        changeNode.path("diff").asText(""),
                        changeNode.path("new_file").asBoolean(false),
                        changeNode.path("deleted_file").asBoolean(false),
                        changeNode.path("renamed_file").asBoolean(false)
                ));
            }
        }
        return new GitlabMergeRequestChanges(
                node.path("iid").asLong(),
                node.path("title").asText(""),
                node.path("description").asText(""),
                changes
        );
    }

    /**
     * 基于指定分支创建 GitLab Tag。
     */
    public GitlabTag createTag(String apiBaseUrl, String token, String projectRef, String tagName, String ref, String message) {
        return createTag(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, tagName, ref, message);
    }

    /**
     * 基于指定分支创建 GitLab Tag，支持不同鉴权方式。
     */
    public GitlabTag createTag(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, String tagName, String ref, String message) {
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/repository/tags?")
                .append("tag_name=").append(urlEncode(tagName))
                .append("&ref=").append(urlEncode(ref));
        if (hasText(message)) {
            url.append("&message=").append(urlEncode(message.trim()));
        }

        JsonNode node = sendJsonRequest("POST", url.toString(), authorization, null, null);
        JsonNode commitNode = node.path("commit");
        return new GitlabTag(
                node.path("name").asText(tagName),
                node.path("message").asText(""),
                node.path("target").asText(""),
                node.path("protected").asBoolean(false),
                commitNode.path("created_at").asText("")
        );
    }

    /**
     * 在指定仓库中创建新的 Merge Request。
     */
    public GitlabCreatedMergeRequest createMergeRequest(String apiBaseUrl,
                                                        String token,
                                                        String projectRef,
                                                        String sourceBranch,
                                                        String targetBranch,
                                                        String title,
                                                        String description) {
        return createMergeRequest(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, sourceBranch, targetBranch, title, description);
    }

    /**
     * 在指定仓库中创建新的 Merge Request，支持项目 token 与 Bearer token。
     */
    public GitlabCreatedMergeRequest createMergeRequest(String apiBaseUrl,
                                                        GitlabAuthorization authorization,
                                                        String projectRef,
                                                        String sourceBranch,
                                                        String targetBranch,
                                                        String title,
                                                        String description) {
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/merge_requests?")
                .append("source_branch=").append(urlEncode(sourceBranch))
                .append("&target_branch=").append(urlEncode(targetBranch))
                .append("&title=").append(urlEncode(title));
        if (hasText(description)) {
            url.append("&description=").append(urlEncode(description.trim()));
        }

        JsonNode node = sendJsonRequest("POST", url.toString(), authorization, null, null);
        return new GitlabCreatedMergeRequest(
                node.path("iid").asLong(),
                node.path("title").asText(""),
                node.path("source_branch").asText(""),
                node.path("target_branch").asText(""),
                node.path("state").asText(""),
                node.path("web_url").asText(""),
                node.path("created_at").asText("")
        );
    }

    public GitlabMergeResult acceptMergeRequest(String apiBaseUrl, String token, String projectRef, Long mergeRequestIid,
                                                boolean autoMerge, boolean squash, boolean removeSourceBranch) {
        return acceptMergeRequest(apiBaseUrl, GitlabAuthorization.privateToken(token), projectRef, mergeRequestIid, autoMerge, squash, removeSourceBranch);
    }

    /**
     * 调用 GitLab 合并接口，可以使用项目 token 或用户 Bearer token。
     */
    public GitlabMergeResult acceptMergeRequest(String apiBaseUrl, GitlabAuthorization authorization, String projectRef, Long mergeRequestIid,
                                                boolean autoMerge, boolean squash, boolean removeSourceBranch) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid + "/merge";

        JsonNode body = objectMapper.createObjectNode()
                .put("auto_merge", autoMerge)
                .put("squash", squash)
                .put("should_remove_source_branch", removeSourceBranch);

        JsonNode node = sendJsonRequest("PUT", url, authorization, body.toString(), "application/json");
        return new GitlabMergeResult(
                node.path("state").asText(""),
                node.path("web_url").asText(""),
                node.path("merge_commit_sha").asText(""),
                node.path("message").asText("ok")
        );
    }

    /**
     * 通过授权码换取 GitLab OAuth token。
     */
    public GitlabOAuthToken exchangeAuthorizationCode(String apiBaseUrl,
                                                      String clientId,
                                                      String clientSecret,
                                                      String code,
                                                      String redirectUri) {
        String body = "client_id=" + urlEncode(clientId)
                + "&client_secret=" + urlEncode(clientSecret)
                + "&code=" + urlEncode(code)
                + "&grant_type=authorization_code"
                + "&redirect_uri=" + urlEncode(redirectUri);
        JsonNode node = sendJsonRequest("POST", resolveSiteBaseUrl(apiBaseUrl) + "/oauth/token", null, body, "application/x-www-form-urlencoded");
        return toGitlabOAuthToken(node);
    }

    /**
     * 使用 refresh token 刷新 GitLab OAuth access token。
     */
    public GitlabOAuthToken refreshOAuthToken(String apiBaseUrl,
                                              String clientId,
                                              String clientSecret,
                                              String refreshToken,
                                              String redirectUri) {
        String body = "client_id=" + urlEncode(clientId)
                + "&client_secret=" + urlEncode(clientSecret)
                + "&refresh_token=" + urlEncode(refreshToken)
                + "&grant_type=refresh_token"
                + "&redirect_uri=" + urlEncode(redirectUri);
        JsonNode node = sendJsonRequest("POST", resolveSiteBaseUrl(apiBaseUrl) + "/oauth/token", null, body, "application/x-www-form-urlencoded");
        return toGitlabOAuthToken(node);
    }

    /**
     * 统一发起 GitLab JSON 请求；当未传鉴权对象时，适用于 OAuth token 交换接口。
     */
    private JsonNode sendJsonRequest(String method, String url, GitlabAuthorization authorization, String body, String contentType) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json");
            if (authorization != null) {
                authorization.apply(builder);
            }

            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", hasText(contentType) ? contentType.trim() : "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                if (response.body() == null || response.body().isBlank()) {
                    return objectMapper.createObjectNode();
                }
                return objectMapper.readTree(response.body());
            }
            throw new IllegalStateException(extractGitlabError(response));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用 GitLab API 失败", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("调用 GitLab API 失败", exception);
        }
    }

    private String extractGitlabError(HttpResponse<String> response) {
        try {
            JsonNode node = objectMapper.readTree(response.body());
            if (node.hasNonNull("message")) {
                JsonNode messageNode = node.get("message");
                if (messageNode.isTextual()) {
                    return "GitLab API 错误: " + messageNode.asText();
                }
                return "GitLab API 错误: " + messageNode.toString();
            }
        } catch (Exception ignored) {
        }
        return "GitLab API 错误，HTTP 状态码: " + response.statusCode();
    }

    private String normalizeBaseUrl(String apiBaseUrl) {
        String value = apiBaseUrl == null ? "" : apiBaseUrl.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String resolveSiteBaseUrl(String apiBaseUrl) {
        return normalizeBaseUrl(apiBaseUrl)
                .replaceAll("/api/v4/?$", "")
                .replaceAll("/+$", "");
    }

    private String encodeProjectRef(String projectRef) {
        String value = projectRef == null ? "" : projectRef.trim();
        if (value.matches("^\\d+$")) {
            return value;
        }
        return urlEncode(value).replace("+", "%20");
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private GitlabMergeRequest toMergeRequest(JsonNode node) {
        JsonNode pipelineNode = node.path("head_pipeline");
        JsonNode divergedNode = node.get("diverged_commits_count");
        Integer divergedCommitsCount = divergedNode == null || divergedNode.isNull() ? null : divergedNode.asInt();
        return new GitlabMergeRequest(
                node.path("iid").asLong(),
                node.path("title").asText(""),
                node.path("state").asText(""),
                node.path("source_branch").asText(""),
                node.path("target_branch").asText(""),
                node.path("draft").asBoolean(false),
                node.path("has_conflicts").asBoolean(false),
                node.path("detailed_merge_status").asText(""),
                pipelineNode.path("status").asText(""),
                node.path("author").path("name").asText(""),
                node.path("author").path("username").asText(""),
                node.path("web_url").asText(""),
                node.path("updated_at").asText(""),
                divergedCommitsCount
        );
    }

    private GitlabOAuthToken toGitlabOAuthToken(JsonNode node) {
        JsonNode expiresInNode = node.get("expires_in");
        Integer expiresInSeconds = expiresInNode == null || expiresInNode.isNull() ? null : expiresInNode.asInt();
        return new GitlabOAuthToken(
                node.path("access_token").asText(""),
                node.path("refresh_token").asText(""),
                expiresInSeconds,
                node.path("token_type").asText("")
        );
    }

    public record GitlabUser(Long id, String username, String name) {
    }

    /**
     * GitLab 项目精简信息。
     * 这里同步返回 Clone 地址，方便仓库规范扫描任务直接复用。
     */
    public record GitlabProject(
            String id,
            String name,
            String pathWithNamespace,
            String webUrl,
            String defaultBranch,
            String httpCloneUrl,
            String sshCloneUrl
    ) {
    }

    /**
     * GitLab 分支接口的精简响应。
     */
    public record GitlabBranch(String name, Boolean defaultBranch, Boolean protectedBranch, Boolean merged, String webUrl) {
    }

    public record GitlabBranchDetail(String name,
                                     Boolean defaultBranch,
                                     Boolean protectedBranch,
                                     Boolean merged,
                                     String webUrl,
                                     String commitSha) {
    }

    public record GitlabMergeRequest(Long iid, String title, String state, String sourceBranch, String targetBranch,
                                     Boolean draft, Boolean hasConflicts, String detailedMergeStatus, String pipelineStatus,
                                     String authorName, String authorUsername, String webUrl, String updatedAt, Integer divergedCommitsCount) {
    }

    public record GitlabCompareResult(boolean sameRef, boolean compareTimeout, List<String> commitIds) {
    }

    /**
     * GitLab API 允许项目 token 与 Bearer token 两种调用方式，这里统一封装请求头。
     */
    public record GitlabAuthorization(String headerName, String headerValue) {

        public static GitlabAuthorization privateToken(String token) {
            return new GitlabAuthorization("PRIVATE-TOKEN", token);
        }

        public static GitlabAuthorization bearerToken(String token) {
            return new GitlabAuthorization("Authorization", "Bearer " + token);
        }

        public void apply(HttpRequest.Builder builder) {
            builder.header(headerName, headerValue);
        }
    }

    /**
     * GitLab 创建 MR 接口的精简返回值。
     */
    public record GitlabCreatedMergeRequest(Long iid,
                                            String title,
                                            String sourceBranch,
                                            String targetBranch,
                                            String state,
                                            String webUrl,
                                            String createdAt) {
    }

    /**
     * GitLab 创建 Tag 接口的精简返回值。
     */
    public record GitlabTag(String name, String message, String target, Boolean protectedTag, String createdAt) {
    }

    /**
     * GitLab OAuth token 接口的关键响应字段。
     */
    public record GitlabOAuthToken(String accessToken, String refreshToken, Integer expiresInSeconds, String tokenType) {
    }

    public record GitlabMergeResult(String state, String webUrl, String mergeCommitSha, String message) {
    }

    public record GitlabMergeRequestChanges(Long iid, String title, String description, List<GitlabChange> changes) {
    }

    public record GitlabChange(String oldPath, String newPath, String diff, boolean newFile, boolean deletedFile, boolean renamedFile) {
    }
}
