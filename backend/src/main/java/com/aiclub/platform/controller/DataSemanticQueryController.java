package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DataSemanticQueryDtos.DataSourceItem;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryExecution;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryInterpretation;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryPreview;
import com.aiclub.platform.dto.DataSemanticQueryDtos.SemanticModelItem;
import com.aiclub.platform.dto.DataSemanticQueryDtos.SchemaTableItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.DataSourceRequest;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.ExecuteRequest;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.InterpretRequest;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.PreviewRequest;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.SemanticModelRequest;
import com.aiclub.platform.service.DataSemanticQueryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 项目级语义查询与治理入口；SQL 只会在服务端由已发布定义生成。 */
@RestController
@RequestMapping("/api/data-workbench/projects/{projectId}")
@OperationLog(moduleCode="DATA_SEMANTIC_QUERY", moduleName="语义数据查询", bizType="DATA_QUERY")
public class DataSemanticQueryController {
    private final DataSemanticQueryService service;
    public DataSemanticQueryController(DataSemanticQueryService service){this.service=service;}
    @GetMapping("/data-sources") @RequirePermission("data-workbench:source-manage") public ApiResponse<List<DataSourceItem>> listSources(@PathVariable Long projectId){return ApiResponse.success(service.listSources(projectId));}
    @PostMapping("/data-sources") @RequirePermission("data-workbench:source-manage") public ApiResponse<DataSourceItem> createSource(@PathVariable Long projectId,@Valid @RequestBody DataSourceRequest r){return ApiResponse.success(service.saveSource(projectId,null,r));}
    @PutMapping("/data-sources/{id}") @RequirePermission("data-workbench:source-manage") public ApiResponse<DataSourceItem> updateSource(@PathVariable Long projectId,@PathVariable Long id,@Valid @RequestBody DataSourceRequest r){return ApiResponse.success(service.saveSource(projectId,id,r));}
    @PostMapping("/data-sources/{id}/test") @RequirePermission("data-workbench:source-manage") public ApiResponse<Void> testSource(@PathVariable Long projectId,@PathVariable Long id){service.testSource(projectId,id);return ApiResponse.success(null);}
    @PostMapping("/data-sources/{id}/scan") @RequirePermission("data-workbench:source-manage") public ApiResponse<DataSourceItem> scanSource(@PathVariable Long projectId,@PathVariable Long id){return ApiResponse.success(service.scanSource(projectId,id));}
    @GetMapping("/data-sources/{id}/schema") @RequirePermission("data-workbench:source-manage") public ApiResponse<PageResponse<SchemaTableItem>> pageSchema(@PathVariable Long projectId,@PathVariable Long id,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String keyword){return ApiResponse.success(service.pageSchema(projectId,id,page,size,keyword));}
    @GetMapping("/semantic-models") @RequirePermission("data-workbench:semantic-manage") public ApiResponse<List<SemanticModelItem>> listModels(@PathVariable Long projectId){return ApiResponse.success(service.listModels(projectId));}
    @PostMapping("/semantic-models") @RequirePermission("data-workbench:semantic-manage") public ApiResponse<SemanticModelItem> createModel(@PathVariable Long projectId,@Valid @RequestBody SemanticModelRequest r){return ApiResponse.success(service.saveModel(projectId,null,r));}
    @PutMapping("/semantic-models/{id}") @RequirePermission("data-workbench:semantic-manage") public ApiResponse<SemanticModelItem> updateModel(@PathVariable Long projectId,@PathVariable Long id,@Valid @RequestBody SemanticModelRequest r){return ApiResponse.success(service.saveModel(projectId,id,r));}
    @PostMapping("/semantic-models/{id}/publish") @RequirePermission("data-workbench:semantic-manage") public ApiResponse<SemanticModelItem> publishModel(@PathVariable Long projectId,@PathVariable Long id){return ApiResponse.success(service.publishModel(projectId,id));}
    @PostMapping("/data-query/interpret") @RequirePermission("data-workbench:query") public ApiResponse<QueryInterpretation> interpret(@PathVariable Long projectId,@Valid @RequestBody InterpretRequest r){return ApiResponse.success(service.interpret(projectId,r.semanticModelId(),r.text()));}
    @PostMapping("/data-query/preview") @RequirePermission("data-workbench:query") public ApiResponse<QueryPreview> preview(@PathVariable Long projectId,@Valid @RequestBody PreviewRequest r){return ApiResponse.success(service.preview(projectId,r.requestId()));}
    @PostMapping("/data-query/execute") @RequirePermission("data-workbench:query") public ApiResponse<QueryExecution> execute(@PathVariable Long projectId,@Valid @RequestBody ExecuteRequest r){return ApiResponse.success(service.execute(projectId,r.requestId(),r.previewToken()));}
}
