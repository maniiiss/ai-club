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
        JsonNode node = sendJsonRequest("GET", normalizeBaseUrl(apiBaseUrl) + "/user", token, null);
        return new GitlabUser(
                node.path("id").asLong(),
                node.path("username").asText(""),
                node.path("name").asText("")
        );
    }

    public GitlabProject fetchProject(String apiBaseUrl, String token, String projectRef) {
        String encodedProjectRef = encodeProjectRef(projectRef);
        JsonNode node = sendJsonRequest("GET", normalizeBaseUrl(apiBaseUrl) + "/projects/" + encodedProjectRef, token, null);
        return new GitlabProject(
                node.path("id").asText(""),
                node.path("name").asText(""),
                node.path("path_with_namespace").asText(projectRef),
                node.path("web_url").asText(""),
                node.path("default_branch").asText("")
        );
    }

    /**
     * 查询仓库分支，供前端远程搜索下拉框使用。
     */
    public List<GitlabBranch> listBranches(String apiBaseUrl, String token, String projectRef, String search) {
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/repository/branches?per_page=100");
        if (hasText(search)) {
            url.append("&search=").append(urlEncode(search.trim()));
        }

        JsonNode arrayNode = sendJsonRequest("GET", url.toString(), token, null);
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
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/merge_requests?per_page=100&order_by=updated_at&sort=desc&with_merge_status_recheck=true");

        if (hasText(state)) {
            url.append("&state=").append(urlEncode(state));
        }
        if (hasText(targetBranch)) {
            url.append("&target_branch=").append(urlEncode(targetBranch));
        }

        JsonNode arrayNode = sendJsonRequest("GET", url.toString(), token, null);
        List<GitlabMergeRequest> items = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode node : arrayNode) {
                items.add(toMergeRequest(node));
            }
        }
        return items;
    }

    public GitlabMergeRequest fetchMergeRequest(String apiBaseUrl, String token, String projectRef, Long mergeRequestIid) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid
                + "?include_diverged_commits_count=true&include_rebase_in_progress=true";
        JsonNode node = sendJsonRequest("GET", url, token, null);
        return toMergeRequest(node);
    }

    public GitlabMergeRequestChanges fetchMergeRequestChanges(String apiBaseUrl, String token, String projectRef, Long mergeRequestIid) {
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid + "/changes";
        JsonNode node = sendJsonRequest("GET", url, token, null);
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
        StringBuilder url = new StringBuilder(normalizeBaseUrl(apiBaseUrl))
                .append("/projects/")
                .append(encodeProjectRef(projectRef))
                .append("/repository/tags?")
                .append("tag_name=").append(urlEncode(tagName))
                .append("&ref=").append(urlEncode(ref));
        if (hasText(message)) {
            url.append("&message=").append(urlEncode(message.trim()));
        }

        JsonNode node = sendJsonRequest("POST", url.toString(), token, null);
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

        JsonNode node = sendJsonRequest("POST", url.toString(), token, null);
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
        String url = normalizeBaseUrl(apiBaseUrl)
                + "/projects/" + encodeProjectRef(projectRef)
                + "/merge_requests/" + mergeRequestIid + "/merge";

        JsonNode body = objectMapper.createObjectNode()
                .put("auto_merge", autoMerge)
                .put("squash", squash)
                .put("should_remove_source_branch", removeSourceBranch);

        JsonNode node = sendJsonRequest("PUT", url, token, body.toString());
        return new GitlabMergeResult(
                node.path("state").asText(""),
                node.path("web_url").asText(""),
                node.path("merge_commit_sha").asText(""),
                node.path("message").asText("ok")
        );
    }

    private JsonNode sendJsonRequest(String method, String url, String token, String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("PRIVATE-TOKEN", token);

            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json")
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

    public record GitlabUser(Long id, String username, String name) {
    }

    public record GitlabProject(String id, String name, String pathWithNamespace, String webUrl, String defaultBranch) {
    }

    /**
     * GitLab 分支接口的精简响应。
     */
    public record GitlabBranch(String name, Boolean defaultBranch, Boolean protectedBranch, Boolean merged, String webUrl) {
    }

    public record GitlabMergeRequest(Long iid, String title, String state, String sourceBranch, String targetBranch,
                                     Boolean draft, Boolean hasConflicts, String detailedMergeStatus, String pipelineStatus,
                                     String authorName, String authorUsername, String webUrl, String updatedAt, Integer divergedCommitsCount) {
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

    public record GitlabMergeResult(String state, String webUrl, String mergeCommitSha, String message) {
    }

    public record GitlabMergeRequestChanges(Long iid, String title, String description, List<GitlabChange> changes) {
    }

    public record GitlabChange(String oldPath, String newPath, String diff, boolean newFile, boolean deletedFile, boolean renamedFile) {
    }
}
