package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证 Backend 与 CLI/Core 对 HandoffSessionEnvelope v1 执行相同安全基线。 */
class HandoffSessionEnvelopeValidatorTests {

    private final HandoffSessionEnvelopeValidator validator = new HandoffSessionEnvelopeValidator(new ObjectMapper());

    @Test
    void shouldAcceptValidEnvelopeAndRejectUnknownFields() {
        Map<String, Object> envelope = validEnvelope();
        assertThat(validator.validate(envelope).get("protocolVersion").asText()).isEqualTo("v1");
        envelope.put("unexpected", true);
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_PROTOCOL_UNSUPPORTED);
    }

    @Test
    void shouldRejectUnsupportedVersionEmptyRequiredFieldsAndSensitiveContent() {
        Map<String, Object> envelope = validEnvelope();
        envelope.put("protocolVersion", "v2");
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_PROTOCOL_UNSUPPORTED);

        envelope = validEnvelope();
        @SuppressWarnings("unchecked")
        Map<String, Object> workspace = (Map<String, Object>) envelope.get("workspace");
        workspace.put("baseCommit", "");
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_INVALID_WORKSPACE);

        envelope = validEnvelope();
        envelope.put("summary", "sk-12345678901234567890");
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_SENSITIVE_CONTENT);
    }

    @Test
    void shouldRejectHistoryAndEnvelopeLimits() {
        Map<String, Object> envelope = validEnvelope();
        envelope.put("conversationHistory", java.util.stream.IntStream.range(0, 51).mapToObj(i -> Map.of("role", "user", "content", "x")).toList());
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_ENVELOPE_TOO_LARGE);

        envelope = validEnvelope();
        envelope.put("summary", "x".repeat(HandoffSessionEnvelopeValidator.MAX_SUMMARY_BYTES + 1));
        assertCode(envelope, HandoffSessionEnvelopeValidator.HANDOFF_ENVELOPE_TOO_LARGE);
    }

    private Map<String, Object> validEnvelope() {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("protocolVersion", "v1");
        envelope.put("sourceClient", Map.of("runtimeCode", "PI_LOCAL", "runtimeVersion", "0.73.1", "cliVersion", "0.1.0"));
        envelope.put("conversationHistory", List.of(Map.of("role", "user", "content", "继续完成任务")));
        envelope.put("summary", "已完成基础实现");
        envelope.put("decisions", List.of("沿用当前接口"));
        envelope.put("pendingItems", List.of("补充测试"));
        envelope.put("workspace", new LinkedHashMap<>(Map.of("baseCommit", "abc", "handoffCommit", "def", "currentBranch", "feature/test")));
        return envelope;
    }

    private void assertCode(Map<String, Object> envelope, String code) {
        assertThatThrownBy(() -> validator.validate(envelope))
                .isInstanceOf(HandoffSessionEnvelopeValidator.HandoffSessionEnvelopeValidationException.class)
                .extracting("code")
                .isEqualTo(code);
    }
}
