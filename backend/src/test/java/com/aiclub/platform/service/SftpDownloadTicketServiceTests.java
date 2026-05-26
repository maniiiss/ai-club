package com.aiclub.platform.service;

import com.aiclub.platform.exception.UnauthorizedException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SftpDownloadTicketServiceTests {

    private static final Instant NOW = Instant.parse("2026-05-26T13:00:00Z");

    @Test
    void shouldValidateTicketForSameServerAndPath() {
        SftpDownloadTicketService service = new SftpDownloadTicketService(
                "test-secret",
                Clock.fixed(NOW, ZoneOffset.UTC)
        );

        SftpDownloadTicketService.TicketPayload payload = service.createTicket(7L, 12L, "/var/log/app.log");

        assertThat(service.validateTicket(payload.ticket(), 12L, "/var/log/app.log")).isEqualTo(7L);
    }

    @Test
    void shouldRejectTicketForDifferentPath() {
        SftpDownloadTicketService service = new SftpDownloadTicketService(
                "test-secret",
                Clock.fixed(NOW, ZoneOffset.UTC)
        );
        SftpDownloadTicketService.TicketPayload payload = service.createTicket(7L, 12L, "/var/log/app.log");

        assertThatThrownBy(() -> service.validateTicket(payload.ticket(), 12L, "/var/log/other.log"))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessageContaining("不匹配");
    }

    @Test
    void shouldRejectExpiredTicket() {
        SftpDownloadTicketService issuer = new SftpDownloadTicketService(
                "test-secret",
                Clock.fixed(NOW, ZoneOffset.UTC)
        );
        SftpDownloadTicketService verifier = new SftpDownloadTicketService(
                "test-secret",
                Clock.fixed(NOW.plusSeconds(121), ZoneOffset.UTC)
        );
        SftpDownloadTicketService.TicketPayload payload = issuer.createTicket(7L, 12L, "/var/log/app.log");

        assertThatThrownBy(() -> verifier.validateTicket(payload.ticket(), 12L, "/var/log/app.log"))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessageContaining("已过期");
    }
}
