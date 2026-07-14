package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeCapability;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Runtime 降级选择规则测试，防止已有副作用后重复切换。 */
class RuntimeFailoverServiceTests {

    @Test
    void shouldOnlyReturnPrimaryAfterSideEffectStarted() {
        RuntimeRegistryService registry = mock(RuntimeRegistryService.class);
        when(registry.isAvailable(any(), any())).thenReturn(true);
        RuntimeFailoverService service = new RuntimeFailoverService(registry, new ObjectMapper());

        assertThat(service.candidates("PI_RUNTIME", "[\"HERMES_LEGACY\"]",
                Set.of(RuntimeCapability.CHAT), true)).containsExactly("PI_RUNTIME");
    }

    @Test
    void shouldSelectHealthyFallbackWithRequiredCapabilities() {
        RuntimeRegistryService registry = mock(RuntimeRegistryService.class);
        when(registry.isAvailable(eq("PI_RUNTIME"), any())).thenReturn(false);
        when(registry.isAvailable(eq("HERMES_LEGACY"), any())).thenReturn(true);
        RuntimeFailoverService service = new RuntimeFailoverService(registry, new ObjectMapper());

        assertThat(service.candidates("PI_RUNTIME", "[\"HERMES_LEGACY\"]",
                Set.of(RuntimeCapability.CHAT), false)).containsExactly("HERMES_LEGACY");
    }
}
