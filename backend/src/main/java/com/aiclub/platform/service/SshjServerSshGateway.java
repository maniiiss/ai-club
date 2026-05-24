package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.IOUtils;
import net.schmizz.sshj.connection.channel.direct.DirectConnection;
import net.schmizz.sshj.connection.channel.direct.Session;
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
import java.util.Map;
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
