package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ServerDetail;
import com.aiclub.platform.dto.ServerMetricSampleItem;
import com.aiclub.platform.dto.ServerSummary;
import com.aiclub.platform.dto.ServerTerminalSessionCreated;
import com.aiclub.platform.dto.SftpDownloadTicket;
import com.aiclub.platform.dto.SftpLsResult;
import com.aiclub.platform.dto.request.ServerAlertConfigUpdateRequest;
import com.aiclub.platform.dto.request.ServerRequest;
import com.aiclub.platform.dto.request.ServerTerminalSessionCreateRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.service.ServerManagementService;
import com.aiclub.platform.service.SftpDownloadAbortedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 平台级服务器管理控制器。
 */
@RestController
@RequestMapping("/api/servers")
@OperationLog(moduleCode = "SERVER", moduleName = "服务器管理", bizType = "SERVER")
public class ServerManagementController {

    private static final Logger logger = LoggerFactory.getLogger(ServerManagementController.class);

    private final ServerManagementService serverManagementService;

    public ServerManagementController(ServerManagementService serverManagementService) {
        this.serverManagementService = serverManagementService;
    }

    @GetMapping
    @RequirePermission("server:view")
    public ApiResponse<PageResponse<ServerSummary>> pageServers(@RequestParam(defaultValue = "1") int page,
                                                                @RequestParam(defaultValue = "12") int size,
                                                                @RequestParam(required = false) String keyword,
                                                                @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(serverManagementService.pageServers(page, size, keyword, enabled));
    }

    @GetMapping("/{id}")
    @RequirePermission("server:view")
    public ApiResponse<ServerDetail> getServer(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.getServer(id));
    }

    @PostMapping
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_CREATE", actionName = "新增服务器")
    public ApiResponse<ServerDetail> createServer(@Valid @RequestBody ServerRequest request) {
        return ApiResponse.success(serverManagementService.createServer(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_UPDATE", actionName = "编辑服务器", bizIdParam = "id")
    public ApiResponse<ServerDetail> updateServer(@PathVariable Long id, @Valid @RequestBody ServerRequest request) {
        return ApiResponse.success(serverManagementService.updateServer(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_DELETE", actionName = "删除服务器", bizIdParam = "id")
    public ApiResponse<Void> deleteServer(@PathVariable Long id) {
        serverManagementService.deleteServer(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/{id}/test-connection")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_TEST_CONNECTION", actionName = "测试服务器连接", bizIdParam = "id")
    public ApiResponse<ServerSummary> testConnection(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.testConnection(id));
    }

    @GetMapping("/{id}/metrics/history")
    @RequirePermission("server:view")
    public ApiResponse<List<ServerMetricSampleItem>> listMetricsHistory(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.listMetricsHistory(id));
    }

    @PutMapping("/{id}/alerts")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_UPDATE_ALERTS", actionName = "更新服务器告警配置", bizIdParam = "id")
    public ApiResponse<ServerDetail> updateAlertConfig(@PathVariable Long id,
                                                       @Valid @RequestBody ServerAlertConfigUpdateRequest request) {
        return ApiResponse.success(serverManagementService.updateAlertConfig(id, request));
    }

    @PostMapping("/{id}/terminal-sessions")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_CREATE_TERMINAL_SESSION", actionName = "创建服务器终端会话", bizIdParam = "id")
    public ApiResponse<ServerTerminalSessionCreated> createTerminalSession(@PathVariable Long id,
                                                                           @Valid @RequestBody(required = false) ServerTerminalSessionCreateRequest request,
                                                                           HttpServletRequest servletRequest) {
        return ApiResponse.success(serverManagementService.createTerminalSession(id, request, servletRequest.getRemoteAddr()));
    }

    @GetMapping("/{id}/sftp/ls")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_SFTP_LS", actionName = "SFTP 浏览目录", bizIdParam = "id")
    public ApiResponse<SftpLsResult> sftpLs(@PathVariable Long id,
                                             @RequestParam(defaultValue = "/") String path) {
        return ApiResponse.success(serverManagementService.sftpLs(id, path));
    }

    @PostMapping(value = "/{id}/sftp/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_SFTP_UPLOAD", actionName = "SFTP 上传文件", bizIdParam = "id")
    public ApiResponse<Void> sftpUpload(@PathVariable Long id,
                                         @RequestParam String remotePath,
                                         @RequestParam MultipartFile file) {
        serverManagementService.sftpUpload(id, remotePath, file);
        return ApiResponse.success(null);
    }

    @GetMapping("/{id}/sftp/download")
    @RequirePermission("server:terminal")
    public void sftpDownload(@PathVariable Long id,
                              @RequestParam String path,
                              @RequestParam(required = false) String ticket,
                              HttpServletResponse response) {
        String fileName = extractFileName(path);

        try {
            // 注意：不要在写入数据前 flushBuffer。
            // 一旦响应已提交，后续 SFTP 故障就无法用 reset() + JSON 错误体回复给前端。
            response.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
            response.setHeader("Content-Disposition", buildAttachmentHeader(fileName));
            if (ticket == null || ticket.isBlank()) {
                serverManagementService.sftpDownload(id, path, response.getOutputStream());
            } else {
                serverManagementService.sftpDownloadByTicket(id, path, ticket, response.getOutputStream());
            }
        } catch (SftpDownloadAbortedException aborted) {
            // 客户端主动断开属于正常场景，记录 warn 即可。
            // 此时响应已经提交，无法再写错误体，前端会自行感知到下载中断。
            logger.warn("SFTP 下载被客户端中断 serverId={} path={} reason={}",
                    id, path, aborted.getMessage());
        } catch (Exception exception) {
            // 判断是否为客户端中断类异常（Spring 6.1+ AsyncRequestNotUsableException 等）
            if (isClientDisconnectException(exception)) {
                logger.warn("SFTP 下载被客户端中断 serverId={} path={} reason={}",
                        id, path, exception.getMessage());
                return;
            }
            logger.error("SFTP 下载失败 serverId={} path={}", id, path, exception);
            if (!response.isCommitted()) {
                response.reset();
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                response.setStatus(resolveDownloadErrorStatus(exception));
                try {
                    writeDownloadError(response, exception);
                } catch (Exception ignored) {
                    // 响应写入也失败，只能放弃
                }
            }
        }
    }

    private int resolveDownloadErrorStatus(Exception exception) {
        if (exception instanceof UnauthorizedException) {
            return HttpServletResponse.SC_UNAUTHORIZED;
        }
        if (exception instanceof IllegalArgumentException) {
            return HttpServletResponse.SC_BAD_REQUEST;
        }
        if (exception instanceof NoSuchElementException) {
            return HttpServletResponse.SC_NOT_FOUND;
        }
        return HttpServletResponse.SC_INTERNAL_SERVER_ERROR;
    }

    private void writeDownloadError(HttpServletResponse response, Exception exception) throws java.io.IOException {
        String errorMsg = exception.getMessage() == null ? "SFTP 下载文件失败" : exception.getMessage();
        if (errorMsg.startsWith("SFTP 下载文件失败：")) {
            errorMsg = errorMsg.substring("SFTP 下载文件失败：".length());
        }
        // 下载接口成功路径使用 OutputStream，失败路径也保持同一响应流，避免 Servlet writer/outputStream 互斥。
        String body = "{\"success\":false,\"message\":\"" + escapeJson(errorMsg) + "\",\"data\":null}";
        response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        response.getOutputStream().flush();
    }

    private String escapeJson(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
    }

    @PostMapping("/{id}/sftp/download-ticket")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_SFTP_DOWNLOAD_TICKET", actionName = "SFTP 创建下载票据", bizIdParam = "id")
    public ApiResponse<SftpDownloadTicket> createSftpDownloadTicket(@PathVariable Long id,
                                                                    @RequestParam String path) {
        return ApiResponse.success(serverManagementService.createSftpDownloadTicket(id, path));
    }

    private String extractFileName(String path) {
        if (path == null || path.isBlank()) {
            return "download";
        }
        int lastSlash = path.lastIndexOf('/');
        if (lastSlash >= 0 && lastSlash < path.length() - 1) {
            return path.substring(lastSlash + 1);
        }
        String trimmed = path.trim();
        return trimmed.isEmpty() || "/".equals(trimmed) ? "download" : trimmed;
    }

    private String buildAttachmentHeader(String fileName) {
        String fallback = fileName.replace("\"", "_")
                .replace("\\", "_")
                .replaceAll("[^\\x20-\\x7E]", "_");
        if (fallback.isBlank()) {
            fallback = "download";
        }
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + fallback + "\"; filename*=UTF-8''" + encoded;
    }

    /**
     * 判断异常是否为客户端主动断开连接导致。
     * Spring 6.1+ 会包装为 AsyncRequestNotUsableException（RuntimeException），
     * 也可能直接是 "Broken pipe" / "Connection reset" 等 IOException。
     */
    private boolean isClientDisconnectException(Exception exception) {
        String className = exception.getClass().getName();
        if (className.contains("AsyncRequestNotUsableException")) {
            return true;
        }
        String msg = exception.getMessage();
        if (msg != null) {
            String lowerMsg = msg.toLowerCase();
            if (lowerMsg.contains("broken pipe") || lowerMsg.contains("connection reset")
                    || lowerMsg.contains("连接中断") || lowerMsg.contains("已中止")) {
                return true;
            }
        }
        // 检查 cause 链
        Throwable cause = exception.getCause();
        if (cause instanceof Exception causeEx) {
            return isClientDisconnectException(causeEx);
        }
        return false;
    }

    @DeleteMapping("/{id}/sftp/file")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_SFTP_DELETE", actionName = "SFTP 删除文件", bizIdParam = "id")
    public ApiResponse<Void> sftpDelete(@PathVariable Long id,
                                         @RequestParam String path,
                                         @RequestParam(defaultValue = "false") boolean recursive) {
        serverManagementService.sftpDelete(id, path, recursive);
        return ApiResponse.success(null);
    }

    @PostMapping("/{id}/sftp/mkdir")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_SFTP_MKDIR", actionName = "SFTP 创建目录", bizIdParam = "id")
    public ApiResponse<Void> sftpMkdir(@PathVariable Long id,
                                        @Valid @RequestBody com.aiclub.platform.dto.request.SftpMkdirRequest request) {
        serverManagementService.sftpMkdir(id, request.path());
        return ApiResponse.success(null);
    }
}
