package com.aiclub.platform.service;

import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchAppItem;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * DataWorkbench 应用目录服务。
 * 业务意图：DataWorkbench 是轻量数据工作台，DataChange 是首个应用，后续可继续注册 DataQuery/DataImport。
 */
@Service
public class DataWorkbenchService {

    public List<DataWorkbenchAppItem> listApps() {
        return List.of(
                new DataWorkbenchAppItem("data-change", "数据变更", "通过自然语言提交受控数据修改请求", true),
                new DataWorkbenchAppItem("data-query", "语义查询", "按已发布业务口径执行受控 PostgreSQL 只读查询", true),
                new DataWorkbenchAppItem("audit", "执行审计", "查看数据变更执行快照与回滚状态", true),
                new DataWorkbenchAppItem("config", "实体配置", "维护实体、字段、定位规则和安全阈值", true),
                new DataWorkbenchAppItem("capabilities", "能力入口", "后续接入数据查询、导入和对账能力", false)
        );
    }
}
