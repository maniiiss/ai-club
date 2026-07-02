package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityParseResult;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataWorkbenchEntityParseRequest;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataWorkbenchEntityRequest;
import com.aiclub.platform.service.DataWorkbenchConfigService;
import com.aiclub.platform.service.DataWorkbenchEntityParser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * DataWorkbench 管理端配置控制器。
 */
@RestController
@RequestMapping("/api/data-workbench/config/entities")
@RequirePermission("data-workbench:config")
@OperationLog(moduleCode = "DATA_WORKBENCH_CONFIG", moduleName = "数据工作台配置", bizType = "DATA_WORKBENCH_ENTITY")
public class DataWorkbenchConfigController {

    private final DataWorkbenchConfigService configService;
    private final DataWorkbenchEntityParser entityParser;

    public DataWorkbenchConfigController(DataWorkbenchConfigService configService,
                                         DataWorkbenchEntityParser entityParser) {
        this.configService = configService;
        this.entityParser = entityParser;
    }

    @GetMapping
    public ApiResponse<List<DataWorkbenchEntityItem>> list(@RequestParam(defaultValue = "true") boolean includeDisabled,
                                                           @RequestParam(required = false) Long platformProjectId) {
        return ApiResponse.success(configService.listEntities(includeDisabled, platformProjectId));
    }

    @GetMapping("/{id}")
    public ApiResponse<DataWorkbenchEntityItem> detail(@PathVariable Long id) {
        return ApiResponse.success(configService.getEntity(id));
    }

    @PostMapping
    @OperationLog(actionCode = "DATA_WORKBENCH_ENTITY_CREATE", actionName = "创建数据实体")
    public ApiResponse<DataWorkbenchEntityItem> create(@Valid @RequestBody DataWorkbenchEntityRequest request) {
        return ApiResponse.success(configService.createEntity(request));
    }

    @PutMapping("/{id}")
    @OperationLog(actionCode = "DATA_WORKBENCH_ENTITY_UPDATE", actionName = "更新数据实体", bizIdParam = "id")
    public ApiResponse<DataWorkbenchEntityItem> update(@PathVariable Long id,
                                                       @Valid @RequestBody DataWorkbenchEntityRequest request) {
        return ApiResponse.success(configService.updateEntity(id, request));
    }

    @DeleteMapping("/{id}")
    @OperationLog(actionCode = "DATA_WORKBENCH_ENTITY_DELETE", actionName = "删除数据实体", bizIdParam = "id")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        configService.deleteEntity(id);
        return ApiResponse.success(null);
    }

    /**
     * 从 DDL / Java 实体类源码解析出实体草稿。
     * 只读操作，不落库；实际保存仍需管理员点击“保存”走 create/update 流程。
     */
    @PostMapping("/parse")
    @OperationLog(actionCode = "DATA_WORKBENCH_ENTITY_PARSE", actionName = "解析数据实体草稿")
    public ApiResponse<DataWorkbenchEntityParseResult> parse(@Valid @RequestBody DataWorkbenchEntityParseRequest request) {
        return ApiResponse.success(entityParser.parse(request.sourceType(), request.content()));
    }
}
