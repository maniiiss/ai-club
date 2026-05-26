package com.aiclub.platform.service;

import com.aiclub.platform.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * 为 SFTP 原生浏览器下载生成短期票据，避免把长期登录 Token 暴露在 URL 中。
 */
@Service
public class SftpDownloadTicketService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final Duration TICKET_TTL = Duration.ofMinutes(2);

    private final String tokenSecret;
    private final Clock clock;

    @Autowired
    public SftpDownloadTicketService(@Value("${platform.security.token-secret}") String tokenSecret) {
        this(tokenSecret, Clock.systemUTC());
    }

    SftpDownloadTicketService(String tokenSecret, Clock clock) {
        this.tokenSecret = tokenSecret;
        this.clock = clock;
    }

    public TicketPayload createTicket(Long userId, Long serverId, String normalizedPath) {
        Instant expiresAt = Instant.now(clock).plus(TICKET_TTL);
        String claims = userId + ":" + serverId + ":" + expiresAt.toEpochMilli() + ":" + hashPath(normalizedPath);
        String ticket = encode(claims + ":" + sign(claims));
        return new TicketPayload(ticket, expiresAt);
    }

    public Long validateTicket(String ticket, Long serverId, String normalizedPath) {
        if (ticket == null || ticket.isBlank()) {
            throw new UnauthorizedException("SFTP 下载票据不能为空");
        }
        String decoded;
        try {
            decoded = new String(Base64.getUrlDecoder().decode(ticket), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw new UnauthorizedException("SFTP 下载票据无效");
        }
        String[] parts = decoded.split(":", 5);
        if (parts.length != 5) {
            throw new UnauthorizedException("SFTP 下载票据无效");
        }
        String claims = parts[0] + ":" + parts[1] + ":" + parts[2] + ":" + parts[3];
        if (!constantTimeEquals(parts[4], sign(claims))) {
            throw new UnauthorizedException("SFTP 下载票据签名无效");
        }
        try {
            Long userId = Long.parseLong(parts[0]);
            Long ticketServerId = Long.parseLong(parts[1]);
            Instant expiresAt = Instant.ofEpochMilli(Long.parseLong(parts[2]));
            if (!ticketServerId.equals(serverId) || !parts[3].equals(hashPath(normalizedPath))) {
                throw new UnauthorizedException("SFTP 下载票据与请求不匹配");
            }
            if (expiresAt.isBefore(Instant.now(clock))) {
                throw new UnauthorizedException("SFTP 下载票据已过期");
            }
            return userId;
        } catch (NumberFormatException exception) {
            throw new UnauthorizedException("SFTP 下载票据无效");
        }
    }

    private String sign(String claims) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(tokenSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return encode(mac.doFinal(claims.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("生成 SFTP 下载票据失败", exception);
        }
    }

    private String hashPath(String normalizedPath) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return encode(digest.digest(normalizedPath.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("生成 SFTP 路径摘要失败", exception);
        }
    }

    private String encode(String value) {
        return encode(value.getBytes(StandardCharsets.UTF_8));
    }

    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private boolean constantTimeEquals(String left, String right) {
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.UTF_8),
                right.getBytes(StandardCharsets.UTF_8)
        );
    }

    public record TicketPayload(String ticket, Instant expiresAt) {
    }
}
