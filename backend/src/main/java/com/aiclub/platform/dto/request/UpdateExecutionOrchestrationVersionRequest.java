package com.aiclub.platform.dto.request;
import jakarta.validation.Valid; import jakarta.validation.constraints.*; import java.util.List;
/** 保存草稿采用完整步骤替换，并通过 revision 防止覆盖并发修改。 */
public record UpdateExecutionOrchestrationVersionRequest(@NotNull Long revision,
        @NotNull @Valid List<StepBinding> stepBindings) {
 public record StepBinding(@NotBlank String stepCode, @NotNull Long agentId,
                           @NotNull @Min(10) @Max(7200) Integer timeoutSeconds) {}
}
