package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.dto.SftpFileItem;
import com.aiclub.platform.dto.SftpLsResult;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.IOUtils;
import net.schmizz.sshj.connection.channel.direct.DirectConnection;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.sftp.FileAttributes;
import net.schmizz.sshj.sftp.FileMode;
import net.schmizz.sshj.sftp.OpenMode;
import net.schmizz.sshj.sftp.RemoteFile;
import net.schmizz.sshj.sftp.RemoteResourceInfo;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 基于 sshj 的真实 SSH 访问实现。
 * 第一版先聚焦 Linux 服务器和单跳跳板机场景。
 */
@Service
public class SshjServerSshGateway implements ServerSshGateway {

    private static final Logger log = LoggerFactory.getLogger(SshjServerSshGateway.class);
    private static final String PROBE_COMMAND = """
            LANG=C sh -lc '
            read _ cpu_user cpu_nice cpu_system cpu_idle cpu_iowait cpu_irq cpu_softirq cpu_steal _ < /proc/stat
            prev_idle=$((cpu_idle + cpu_iowait))
            prev_total=$((cpu_user + cpu_nice + cpu_system + cpu_idle + cpu_iowait + cpu_irq + cpu_softirq + cpu_steal))
            sleep 1
            read _ cpu_user cpu_nice cpu_system cpu_idle cpu_iowait cpu_irq cpu_softirq cpu_steal _ < /proc/stat
            idle=$((cpu_idle + cpu_iowait))
            total=$((cpu_user + cpu_nice + cpu_system + cpu_idle + cpu_iowait + cpu_irq + cpu_softirq + cpu_steal))
            diff_idle=$((idle - prev_idle))
            diff_total=$((total - prev_total))
            if [ "$diff_total" -gt 0 ]; then cpu=$(((100 * (diff_total - diff_idle)) / diff_total)); else cpu=0; fi
            mem=$(awk "/MemTotal:/ {total=\\$2} /MemAvailable:/ {available=\\$2} END {if (total>0) printf \\"%d\\", ((total-available)*100)/total; else print 0}" /proc/meminfo 2>/dev/null)
            disk=$(df -P / 2>/dev/null | awk "NR==2 {gsub(/%/, \\"\\", \\$5); print \\$5}")
            printf "cpu=%s\\nmem=%s\\ndisk=%s\\n" "${cpu:-0}" "${mem:-0}" "${disk:-0}"
            '
            """;

    private final TokenCipherService tokenCipherService;

    public SshjServerSshGateway(TokenCipherService tokenCipherService) {
        this.tokenCipherService = tokenCipherService;
    }

    @Override
    public ServerProbeSnapshot probe(ServerInfoEntity server) {
        ConnectedClients connectedClients = connect(server);
        try (connectedClients; Session session = connectedClients.targetClient().startSession()) {
            Session.Command command = session.exec(PROBE_COMMAND);
            command.join(20, TimeUnit.SECONDS);
            String stdout = readStream(command.getInputStream());
            String stderr = readStream(command.getErrorStream());
            Integer exitStatus = command.getExitStatus();
            if (exitStatus != null && exitStatus != 0) {
                throw new IllegalStateException(sanitizeMessage(stderr.isBlank() ? stdout : stderr));
            }
            Map<String, Integer> parsed = parseProbeResult(stdout);
            return new ServerProbeSnapshot(
                    parsed.get("cpu"),
                    parsed.get("mem"),
                    parsed.get("disk"),
                    "CPU " + parsed.get("cpu") + "% / 内存 " + parsed.get("mem") + "% / 磁盘 " + parsed.get("disk") + "%"
            );
        } catch (IOException exception) {
            throw new IllegalStateException("服务器探测失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public ServerShellClient openShell(ServerInfoEntity server, int cols, int rows) {
        ConnectedClients connectedClients = connect(server);
        try {
            Session session = connectedClients.targetClient().startSession();
            session.allocatePTY("xterm", cols, rows, 0, 0, Map.of());
            Session.Shell shell = session.startShell();
            return new SshjShellClient(connectedClients, session, shell);
        } catch (IOException exception) {
            connectedClients.close();
            throw new IllegalStateException("SSH 终端连接失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public SftpLsResult listDirectory(ServerInfoEntity server, String path) {
        validatePath(path);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient()) {
            List<RemoteResourceInfo> entries = sftp.ls(path);
            List<SftpFileItem> files = new ArrayList<>(entries.size());
            for (RemoteResourceInfo entry : entries) {
                // 跳过当前目录项 "."
                if (".".equals(entry.getName())) {
                    continue;
                }
                FileAttributes attrs = entry.getAttributes();
                SftpResolvedAttributes resolvedAttrs = resolveDisplayAttributes(sftp, entry);
                files.add(new SftpFileItem(
                        entry.getName(),
                        normalizePath(entry.getPath()),
                        resolvedAttrs.attributes().getType() == FileMode.Type.DIRECTORY,
                        resolvedAttrs.symbolicLink(),
                        resolvedAttrs.linkTarget(),
                        resolvedAttrs.attributes().getSize(),
                        formatModificationTime(resolvedAttrs.attributes().getMtime()),
                        formatFileMode(resolvedAttrs.attributes().getMode())
                ));
            }
            return new SftpLsResult(path, files);
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 列出目录失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public void uploadFile(ServerInfoEntity server, String remotePath, InputStream inputStream, long size) {
        validatePath(remotePath);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient()) {
            // SSHJ SFTPClient.put() 不支持 InputStream，改用 open() + write() 流式写入
            Set<OpenMode> modes = EnumSet.of(OpenMode.WRITE, OpenMode.CREAT, OpenMode.TRUNC);
            net.schmizz.sshj.sftp.RemoteFile remoteFile = sftp.open(remotePath, modes);
            try (remoteFile; inputStream) {
                byte[] buffer = new byte[32768];
                long fileOffset = 0;
                int read;
                while ((read = inputStream.read(buffer)) != -1) {
                    remoteFile.write(fileOffset, buffer, 0, read);
                    fileOffset += read;
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 上传文件失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public void downloadFile(ServerInfoEntity server, String remotePath, OutputStream outputStream) {
        validatePath(remotePath);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient();
             RemoteFile remoteFile = sftp.open(remotePath);
             InputStream remoteInput = remoteFile.new RemoteFileInputStream()) {
            // SSHJ 推荐通过 RemoteFileInputStream 流式读取远程文件，
            // 内部已处理 EOF / 短读 / 重试，避免我们手算 length 与 offset 引入的边界错误。
            byte[] buffer = new byte[32768];
            int read;
            while ((read = remoteInput.read(buffer)) != -1) {
                writeToOutput(outputStream, buffer, read, remotePath);
            }
            flushOutput(outputStream, remotePath);
        } catch (SftpDownloadAbortedException aborted) {
            // 客户端主动断开，直接向上抛出，由 Controller 处理
            throw aborted;
        } catch (IOException exception) {
            log.error("SFTP 下载文件失败 remotePath={} error={}", remotePath, exception.getMessage(), exception);
            throw new IllegalStateException("SFTP 下载文件失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public RemoteFileMetadata readFileMetadata(ServerInfoEntity server, String remotePath) {
        validatePath(remotePath);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient()) {
            FileAttributes attributes = sftp.stat(remotePath);
            return new RemoteFileMetadata(
                    normalizePath(remotePath),
                    attributes.getSize(),
                    attributes.getMtime(),
                    attributes.getType() == FileMode.Type.DIRECTORY,
                    attributes.getType() == FileMode.Type.SYMLINK
            );
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 读取文件属性失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public byte[] readFileChunk(ServerInfoEntity server, String remotePath, long offset, int maxBytes) {
        validatePath(remotePath);
        if (offset < 0) {
            throw new IllegalArgumentException("读取偏移量不能小于 0");
        }
        if (maxBytes <= 0) {
            throw new IllegalArgumentException("读取字节数必须大于 0");
        }
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient();
             RemoteFile remoteFile = sftp.open(remotePath, EnumSet.of(OpenMode.READ))) {
            byte[] buffer = new byte[maxBytes];
            int read = remoteFile.read(offset, buffer, 0, maxBytes);
            if (read <= 0) {
                return new byte[0];
            }
            if (read == buffer.length) {
                return buffer;
            }
            byte[] result = new byte[read];
            System.arraycopy(buffer, 0, result, 0, read);
            return result;
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 读取文件片段失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 向输出流写入数据，捕获客户端断开连接导致的所有异常类型。
     * Spring 6.1+ 在客户端中断时可能抛出 AsyncRequestNotUsableException（RuntimeException），
     * 也可能抛出 IOException，两种情况均视为客户端主动断开。
     */
    private void writeToOutput(OutputStream outputStream, byte[] buffer, int length, String remotePath) throws IOException {
        try {
            outputStream.write(buffer, 0, length);
        } catch (IOException writeException) {
            log.warn("SFTP 下载过程中客户端连接中断 remotePath={} reason={}",
                    remotePath, sanitizeMessage(writeException.getMessage()));
            throw new SftpDownloadAbortedException(writeException);
        } catch (RuntimeException runtimeException) {
            // Spring 6.1 的 AsyncRequestNotUsableException 是 RuntimeException
            log.warn("SFTP 下载过程中客户端连接中断（运行时异常） remotePath={} reason={}",
                    remotePath, sanitizeMessage(runtimeException.getMessage()));
            throw new SftpDownloadAbortedException(runtimeException);
        }
    }

    /**
     * 刷新输出流，同样需要处理客户端中断。
     */
    private void flushOutput(OutputStream outputStream, String remotePath) throws IOException {
        try {
            outputStream.flush();
        } catch (IOException flushException) {
            log.warn("SFTP 下载 flush 阶段客户端连接中断 remotePath={} reason={}",
                    remotePath, sanitizeMessage(flushException.getMessage()));
            throw new SftpDownloadAbortedException(flushException);
        } catch (RuntimeException runtimeException) {
            log.warn("SFTP 下载 flush 阶段客户端连接中断（运行时异常） remotePath={} reason={}",
                    remotePath, sanitizeMessage(runtimeException.getMessage()));
            throw new SftpDownloadAbortedException(runtimeException);
        }
    }

    @Override
    public void delete(ServerInfoEntity server, String path, boolean recursive) {
        validatePath(path);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient()) {
            // FileAttributes 没有.isDirectory()，通过 stat() 返回的 getType() 判断
            boolean isDirectory = sftp.stat(path).getType() == FileMode.Type.DIRECTORY;
            if (isDirectory) {
                if (recursive) {
                    deleteDirectoryRecursive(sftp, path);
                } else {
                    sftp.rmdir(path);
                }
            } else {
                sftp.rm(path);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 删除失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    @Override
    public void mkdir(ServerInfoEntity server, String path) {
        validatePath(path);
        ConnectedClients connectedClients = connectForSftp(server);
        try (connectedClients; SFTPClient sftp = connectedClients.targetClient().newSFTPClient()) {
            sftp.mkdirs(path);
        } catch (IOException exception) {
            throw new IllegalStateException("SFTP 创建目录失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    private ConnectedClients connect(ServerInfoEntity server) {
        try {
            SSHClient jumpClient = null;
            DirectConnection directConnection = null;
            SSHClient targetClient = createClient();
            if (server.isJumpHostEnabled()) {
                jumpClient = createClient();
                connectDirect(jumpClient, server.getJumpHost(), defaultPort(server.getJumpPort()));
                authenticate(jumpClient, server.getJumpUsername(), server.getJumpAuthType(),
                        server.getJumpPasswordCiphertext(), server.getJumpPrivateKeyCiphertext(), server.getJumpPrivateKeyPassphraseCiphertext());
                directConnection = jumpClient.newDirectConnection(server.getHost(), defaultPort(server.getPort()));
                targetClient.connectVia(directConnection);
            } else {
                connectDirect(targetClient, server.getHost(), defaultPort(server.getPort()));
            }
            authenticate(targetClient, server.getUsername(), server.getAuthType(),
                    server.getPasswordCiphertext(), server.getPrivateKeyCiphertext(), server.getPrivateKeyPassphraseCiphertext());
            return new ConnectedClients(targetClient, jumpClient, directConnection);
        } catch (IOException exception) {
            throw new IllegalStateException("SSH 连接失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    private SSHClient createClient() {
        SSHClient client = new SSHClient();
        client.addHostKeyVerifier(new PromiscuousVerifier());
        client.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        client.setTimeout((int) Duration.ofSeconds(20).toMillis());
        return client;
    }

    private void connectDirect(SSHClient client, String host, int port) throws IOException {
        client.connect(host, port);
    }

    private void authenticate(SSHClient client,
                              String username,
                              String authType,
                              String passwordCiphertext,
                              String privateKeyCiphertext,
                              String passphraseCiphertext) throws IOException {
        if (ServerInfoEntity.AUTH_TYPE_PASSWORD.equalsIgnoreCase(authType)) {
            client.authPassword(username, tokenCipherService.decrypt(passwordCiphertext));
            return;
        }
        String privateKey = tokenCipherService.decrypt(privateKeyCiphertext);
        String passphrase = hasText(passphraseCiphertext) ? tokenCipherService.decrypt(passphraseCiphertext) : null;
        Path tempKeyFile = Files.createTempFile("ai-club-server-key-", ".pem");
        try {
            Files.writeString(tempKeyFile, privateKey, StandardCharsets.UTF_8);
            if (passphrase == null) {
                client.authPublickey(username, client.loadKeys(tempKeyFile.toString()));
            } else {
                client.authPublickey(username, client.loadKeys(tempKeyFile.toString(), passphrase));
            }
        } finally {
            try {
                Files.deleteIfExists(tempKeyFile);
            } catch (IOException exception) {
                log.debug("删除临时私钥文件失败 path={}", tempKeyFile, exception);
            }
        }
    }

    static String probeCommand() {
        return PROBE_COMMAND;
    }

    static Map<String, Integer> parseProbeResult(String stdout) {
        java.util.LinkedHashMap<String, Integer> values = new java.util.LinkedHashMap<>();
        values.put("cpu", 0);
        values.put("mem", 0);
        values.put("disk", 0);
        for (String rawLine : stdout.split("\\R")) {
            String line = rawLine == null ? "" : rawLine.trim();
            if (line.isEmpty() || !line.contains("=")) {
                continue;
            }
            String[] pair = line.split("=", 2);
            if (!values.containsKey(pair[0])) {
                continue;
            }
            try {
                values.put(pair[0], Integer.parseInt(pair[1].trim()));
            } catch (NumberFormatException ignored) {
                values.put(pair[0], 0);
            }
        }
        return values;
    }

    private int defaultPort(Integer port) {
        if (port == null || port < 1 || port > 65535) {
            return 22;
        }
        return port;
    }

    private String readStream(InputStream inputStream) throws IOException {
        if (inputStream == null) {
            return "";
        }
        return IOUtils.readFully(inputStream).toString(StandardCharsets.UTF_8);
    }

    private String sanitizeMessage(String message) {
        if (message == null || message.isBlank()) {
            return "远端拒绝连接或认证失败";
        }
        String normalized = message
                .replaceAll("(?i)password\\s*[:=]\\s*\\S+", "password=******")
                .replaceAll("(?i)passphrase\\s*[:=]\\s*\\S+", "passphrase=******")
                .trim();
        return normalized.length() <= 500 ? normalized : normalized.substring(0, 500);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /** 为 SFTP 操作创建连接，设置更长的超时以支持大文件传输 */
    private ConnectedClients connectForSftp(ServerInfoEntity server) {
        try {
            SSHClient jumpClient = null;
            DirectConnection directConnection = null;
            SSHClient targetClient = createSftpClient();
            if (server.isJumpHostEnabled()) {
                jumpClient = createSftpClient();
                connectDirect(jumpClient, server.getJumpHost(), defaultPort(server.getJumpPort()));
                authenticate(jumpClient, server.getJumpUsername(), server.getJumpAuthType(),
                        server.getJumpPasswordCiphertext(), server.getJumpPrivateKeyCiphertext(), server.getJumpPrivateKeyPassphraseCiphertext());
                directConnection = jumpClient.newDirectConnection(server.getHost(), defaultPort(server.getPort()));
                targetClient.connectVia(directConnection);
            } else {
                connectDirect(targetClient, server.getHost(), defaultPort(server.getPort()));
            }
            authenticate(targetClient, server.getUsername(), server.getAuthType(),
                    server.getPasswordCiphertext(), server.getPrivateKeyCiphertext(), server.getPrivateKeyPassphraseCiphertext());
            return new ConnectedClients(targetClient, jumpClient, directConnection);
        } catch (IOException exception) {
            throw new IllegalStateException("SSH 连接失败：" + sanitizeMessage(exception.getMessage()), exception);
        }
    }

    /** 创建用于 SFTP 操作的 SSH 客户端，超时设置更长以适应大文件传输 */
    private SSHClient createSftpClient() {
        SSHClient client = new SSHClient();
        client.addHostKeyVerifier(new PromiscuousVerifier());
        client.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        client.setTimeout((int) Duration.ofMinutes(5).toMillis());
        return client;
    }

    /** 校验路径安全性，拒绝路径遍历攻击 */
    private void validatePath(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("路径不能为空");
        }
        for (String segment : path.split("/")) {
            if ("..".equals(segment)) {
                throw new IllegalArgumentException("路径不允许包含 '..'：" + path);
            }
        }
    }

    /** 规范化路径，去除多余的斜杠 */
    private String normalizePath(String path) {
        if (path == null) {
            return "/";
        }
        // 将多个连续斜杠替换为单个
        String normalized = path.replaceAll("/+", "/");
        // 去除尾随斜杠（根路径除外）
        if (normalized.length() > 1 && normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized.isEmpty() ? "/" : normalized;
    }

    private SftpResolvedAttributes resolveDisplayAttributes(SFTPClient sftp, RemoteResourceInfo entry) {
        FileAttributes attrs = entry.getAttributes();
        if (attrs.getType() != FileMode.Type.SYMLINK) {
            return new SftpResolvedAttributes(attrs, false, null);
        }
        String linkTarget = null;
        try {
            linkTarget = sftp.readlink(entry.getPath());
            // 下载时会跟随符号链接，列表也展示目标文件属性，避免 28B 链接显示成 80MB 下载的错觉。
            return new SftpResolvedAttributes(sftp.stat(entry.getPath()), true, linkTarget);
        } catch (IOException exception) {
            log.debug("读取 SFTP 符号链接目标属性失败 path={} target={}",
                    entry.getPath(), linkTarget, exception);
            return new SftpResolvedAttributes(attrs, true, linkTarget);
        }
    }

    /**
     * 将 SSHJ 的数字权限掩码转换为 Linux 常见展示格式，例如 drwxr-xr-x。
     * SSHJ 默认 toString() 是调试信息（[mask=40755]），不适合作为页面权限列。
     */
    static String formatFileMode(FileMode mode) {
        if (mode == null) {
            return "-";
        }
        int permissions = mode.getPermissionsMask();
        char[] chars = new char[] {
                typeChar(mode.getType()),
                (permissions & 0400) != 0 ? 'r' : '-',
                (permissions & 0200) != 0 ? 'w' : '-',
                executeChar(permissions, 0100, 04000, 's', 'S'),
                (permissions & 0040) != 0 ? 'r' : '-',
                (permissions & 0020) != 0 ? 'w' : '-',
                executeChar(permissions, 0010, 02000, 's', 'S'),
                (permissions & 0004) != 0 ? 'r' : '-',
                (permissions & 0002) != 0 ? 'w' : '-',
                executeChar(permissions, 0001, 01000, 't', 'T')
        };
        return new String(chars);
    }

    private static char typeChar(FileMode.Type type) {
        if (type == null) {
            return '-';
        }
        return switch (type) {
            case DIRECTORY -> 'd';
            case SYMLINK -> 'l';
            case BLOCK_SPECIAL -> 'b';
            case CHAR_SPECIAL -> 'c';
            case FIFO_SPECIAL -> 'p';
            case SOCKET_SPECIAL -> 's';
            default -> '-';
        };
    }

    private static char executeChar(int permissions, int executeMask, int specialMask, char executableSpecial, char nonExecutableSpecial) {
        boolean executable = (permissions & executeMask) != 0;
        boolean special = (permissions & specialMask) != 0;
        if (special) {
            return executable ? executableSpecial : nonExecutableSpecial;
        }
        return executable ? 'x' : '-';
    }

    /** 将 SSHJ 返回的 mtime（Unix 秒）格式化为可读字符串 */
    private String formatModificationTime(long mtime) {
        if (mtime == 0) {
            return "";
        }
        return Instant.ofEpochSecond(mtime)
                .atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    /** 递归删除远程目录及其所有内容 */
    private void deleteDirectoryRecursive(SFTPClient sftp, String path) throws IOException {
        List<RemoteResourceInfo> entries = sftp.ls(path);
        for (RemoteResourceInfo entry : entries) {
            String name = entry.getName();
            if (".".equals(name) || "..".equals(name)) {
                continue;
            }
            String childPath = normalizePath(path + "/" + name);
            if (entry.isDirectory()) {
                deleteDirectoryRecursive(sftp, childPath);
            } else {
                sftp.rm(childPath);
            }
        }
        sftp.rmdir(path);
    }

    private record ConnectedClients(
            SSHClient targetClient,
            SSHClient jumpClient,
            DirectConnection directConnection
    ) implements AutoCloseable {

        @Override
        public void close() {
            closeQuietly(directConnection);
            closeQuietly(targetClient);
            closeQuietly(jumpClient);
        }

        private void closeQuietly(AutoCloseable closeable) {
            if (closeable == null) {
                return;
            }
            try {
                closeable.close();
            } catch (Exception ignored) {
                // ignore
            }
        }
    }

    private record SftpResolvedAttributes(
            FileAttributes attributes,
            boolean symbolicLink,
            String linkTarget
    ) {
    }

    private static final class SshjShellClient implements ServerShellClient {

        private final ConnectedClients connectedClients;
        private final Session session;
        private final Session.Shell shell;

        private SshjShellClient(ConnectedClients connectedClients, Session session, Session.Shell shell) {
            this.connectedClients = connectedClients;
            this.session = session;
            this.shell = shell;
        }

        @Override
        public InputStream stdout() {
            return shell.getInputStream();
        }

        @Override
        public InputStream stderr() {
            return shell.getErrorStream();
        }

        @Override
        public OutputStream stdin() {
            return shell.getOutputStream();
        }

        @Override
        public void resize(int cols, int rows) {
            try {
                shell.changeWindowDimensions(cols, rows, 0, 0);
            } catch (IOException exception) {
                throw new IllegalStateException("终端窗口尺寸调整失败", exception);
            }
        }

        @Override
        public void close() {
            try {
                shell.close();
            } catch (IOException ignored) {
                // ignore
            }
            try {
                session.close();
            } catch (IOException ignored) {
                // ignore
            }
            connectedClients.close();
        }
    }
}
