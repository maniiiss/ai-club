package com.aiclub.platform.service;
/** 受管执行场景没有可用已发布编排时的稳定领域错误。 */
public class ExecutionOrchestrationNotReadyException extends IllegalStateException {
 public ExecutionOrchestrationNotReadyException(String message){super("ORCHESTRATION_NOT_READY: " + message);}
}
