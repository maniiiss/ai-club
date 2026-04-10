package com.aiclub.platform.security;

import com.aiclub.platform.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

@Service
public class TokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String tokenSecret;
    private final long expireHours;

    public TokenService(@Value("${platform.security.token-secret}") String tokenSecret,
                        @Value("${platform.security.token-expire-hours:12}") long expireHours) {
        this.tokenSecret = tokenSecret;
        this.expireHours = expireHours;
    }

    public TokenPayload createToken(Long userId) {
        Instant expiresAt = Instant.now().plus(expireHours, ChronoUnit.HOURS);
        String payload = userId + ":" + expiresAt.toEpochMilli();
        String token = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString((payload + ":" + sign(payload)).getBytes(StandardCharsets.UTF_8));
        return new TokenPayload(token, expiresAt);
    }

    public TokenClaims parseToken(String bearerToken) {
        String token = resolveRawToken(bearerToken);
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String[] parts = decoded.split(":");
            if (parts.length != 3) {
                throw new UnauthorizedException("Invalid auth token");
            }

            String payload = parts[0] + ":" + parts[1];
            String expectedSignature = sign(payload);
            if (!expectedSignature.equals(parts[2])) {
                throw new UnauthorizedException("Invalid auth token signature");
            }

            long expiresAtEpoch = Long.parseLong(parts[1]);
            Instant expiresAt = Instant.ofEpochMilli(expiresAtEpoch);
            if (expiresAt.isBefore(Instant.now())) {
                throw new UnauthorizedException("Login expired, please sign in again");
            }

            return new TokenClaims(Long.parseLong(parts[0]), expiresAt);
        } catch (IllegalArgumentException ex) {
            throw new UnauthorizedException("Invalid auth token");
        }
    }

    public String resolveRawToken(String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new UnauthorizedException("Missing auth token");
        }
        if (bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7).trim();
        }
        return bearerToken.trim();
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(tokenSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] bytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to generate auth token", ex);
        }
    }

    public record TokenPayload(String token, Instant expiresAt) {
    }

    public record TokenClaims(Long userId, Instant expiresAt) {
    }
}
