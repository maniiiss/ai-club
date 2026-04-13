package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

/**
 * 负责生成和校验 GitLab OAuth state，避免授权回调被串号或伪造。
 */
@Service
public class GitlabOauthStateService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String tokenSecret;
    private final long stateExpireMinutes;

    public GitlabOauthStateService(@Value("${platform.security.token-secret}") String tokenSecret,
                                   @Value("${platform.gitlab.oauth.state-expire-minutes:10}") long stateExpireMinutes) {
        this.tokenSecret = tokenSecret;
        this.stateExpireMinutes = stateExpireMinutes;
    }

    /**
     * 将当前用户、目标 GitLab 实例和签发时间一起编码为短时效 state。
     */
    public String generateState(Long userId, String apiBaseUrl) {
        long issuedAt = Instant.now().toEpochMilli();
        String encodedApiBaseUrl = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(apiBaseUrl.getBytes(StandardCharsets.UTF_8));
        String payload = userId + ":" + issuedAt + ":" + encodedApiBaseUrl;
        String signedPayload = payload + ":" + sign(payload);
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(signedPayload.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 校验 state 签名与时效，成功后返回可直接消费的载荷。
     */
    public GitlabOauthStatePayload parseState(String state) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(state), StandardCharsets.UTF_8);
            String[] parts = decoded.split(":");
            if (parts.length != 4) {
                throw new IllegalArgumentException("GitLab 授权状态参数无效，请重新发起绑定");
            }
            String payload = parts[0] + ":" + parts[1] + ":" + parts[2];
            if (!sign(payload).equals(parts[3])) {
                throw new IllegalArgumentException("GitLab 授权状态参数签名无效，请重新发起绑定");
            }
            Instant issuedAt = Instant.ofEpochMilli(Long.parseLong(parts[1]));
            if (issuedAt.plus(stateExpireMinutes, ChronoUnit.MINUTES).isBefore(Instant.now())) {
                throw new IllegalArgumentException("GitLab 授权已超时，请重新发起绑定");
            }
            String apiBaseUrl = new String(Base64.getUrlDecoder().decode(parts[2]), StandardCharsets.UTF_8);
            return new GitlabOauthStatePayload(Long.parseLong(parts[0]), apiBaseUrl, issuedAt);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitLab 授权状态参数无效，请重新发起绑定", exception);
        }
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(tokenSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] bytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } catch (Exception exception) {
            throw new IllegalStateException("生成 GitLab OAuth state 签名失败", exception);
        }
    }

    /**
     * OAuth state 中解析出的业务上下文。
     */
    public record GitlabOauthStatePayload(Long userId, String apiBaseUrl, Instant issuedAt) {
    }
}
