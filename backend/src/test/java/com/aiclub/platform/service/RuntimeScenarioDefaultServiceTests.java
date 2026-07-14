package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RuntimeRegistryEntity;
import com.aiclub.platform.domain.model.RuntimeScenarioDefaultEntity;
import com.aiclub.platform.dto.RuntimeScenarioDefaultSummary;
import com.aiclub.platform.dto.request.RuntimeScenarioDefaultRequest;
import com.aiclub.platform.repository.RuntimeScenarioDefaultRepository;
import com.aiclub.platform.runtime.RuntimeAdapterType;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.aiclub.platform.runtime.RuntimeDescriptor;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RuntimeScenarioDefaultServiceTests {

    @Test
    void shouldExposeFourScenarioDefaultsWhenDatabaseRowsAreMissing() {
        RuntimeScenarioDefaultRepository repository = mock(RuntimeScenarioDefaultRepository.class);
        RuntimeRegistryService registryService = mock(RuntimeRegistryService.class);
        when(repository.findById(any())).thenReturn(Optional.empty());

        RuntimeScenarioDefaultService service = new RuntimeScenarioDefaultService(repository, registryService);

        assertThat(service.list()).extracting(RuntimeScenarioDefaultSummary::scenarioCode)
                .containsExactlyInAnyOrder(
                        RuntimeScenarioDefaultService.SCENARIO_ASSISTANT,
                        RuntimeScenarioDefaultService.SCENARIO_CHAT_ROOM,
                        RuntimeScenarioDefaultService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                        RuntimeScenarioDefaultService.SCENARIO_TECHNICAL_DESIGN_AUTHORING
                );
        assertThat(service.resolve(RuntimeScenarioDefaultService.SCENARIO_ASSISTANT)).isEqualTo("HERMES_LEGACY");
    }

    @Test
    void shouldRejectRuntimeMissingScenarioCapabilities() {
        RuntimeScenarioDefaultRepository repository = mock(RuntimeScenarioDefaultRepository.class);
        RuntimeRegistryService registryService = mock(RuntimeRegistryService.class);
        RuntimeRegistryEntity runtime = new RuntimeRegistryEntity();
        runtime.setRuntimeCode("PI_RUNTIME");
        runtime.setEnabled(true);
        when(registryService.require("PI_RUNTIME")).thenReturn(runtime);
        when(registryService.descriptor("PI_RUNTIME")).thenReturn(new RuntimeDescriptor(
                "PI_RUNTIME", RuntimeAdapterType.STATEFUL_AGENT, "pi-runtime.internal", "1", EnumSet.of(RuntimeCapability.CHAT), "{}"));

        RuntimeScenarioDefaultService service = new RuntimeScenarioDefaultService(repository, registryService);

        assertThatThrownBy(() -> service.update(
                RuntimeScenarioDefaultService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                new RuntimeScenarioDefaultRequest("PI_RUNTIME")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缺少能力");
    }

    @Test
    void shouldSaveRuntimeWhenCapabilitiesAreSatisfied() {
        RuntimeScenarioDefaultRepository repository = mock(RuntimeScenarioDefaultRepository.class);
        RuntimeRegistryService registryService = mock(RuntimeRegistryService.class);
        RuntimeRegistryEntity runtime = new RuntimeRegistryEntity();
        runtime.setRuntimeCode("CODEX_CLI");
        runtime.setEnabled(true);
        when(registryService.require("CODEX_CLI")).thenReturn(runtime);
        when(registryService.descriptor("CODEX_CLI")).thenReturn(new RuntimeDescriptor(
                "CODEX_CLI", RuntimeAdapterType.CLI_RUNNER, "code-processing.cli", "managed",
                EnumSet.of(RuntimeCapability.STREAM_EVENTS, RuntimeCapability.PLAN, RuntimeCapability.IMPLEMENT,
                        RuntimeCapability.TEST, RuntimeCapability.REPOSITORY_READ, RuntimeCapability.REPOSITORY_WRITE), "{}"));
        when(repository.findById(RuntimeScenarioDefaultService.SCENARIO_DEVELOPMENT_IMPLEMENTATION)).thenReturn(Optional.empty());
        when(repository.save(any(RuntimeScenarioDefaultEntity.class))).thenAnswer(invocation -> {
            RuntimeScenarioDefaultEntity entity = invocation.getArgument(0);
            entity.setUpdatedAt(java.time.LocalDateTime.now());
            return entity;
        });

        RuntimeScenarioDefaultService service = new RuntimeScenarioDefaultService(repository, registryService);

        assertThat(service.update(
                RuntimeScenarioDefaultService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                new RuntimeScenarioDefaultRequest("codex_cli"))).extracting(RuntimeScenarioDefaultSummary::runtimeRegistryCode)
                .isEqualTo("CODEX_CLI");
    }
}
