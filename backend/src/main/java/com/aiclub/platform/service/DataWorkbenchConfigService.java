package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityItem;
import com.aiclub.platform.dto.request.DataWorkbenchRequests.DataWorkbenchEntityRequest;
import com.aiclub.platform.repository.DataWorkbenchEntityRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;

/**
 * DataWorkbench 实体配置服务。
 * 业务意图：管理端通过配置维护实体、字段、同义词、定位字段和执行阈值，DataChange 运行时只消费这些白名单。
 * v2 起每个实体强制绑定一个平台项目，SQL 执行不再向业务表注入项目隔离条件。
 */
@Service
@Transactional(readOnly = true)
public class DataWorkbenchConfigService {

    private static final Pattern SQL_IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final DataWorkbenchEntityRepository entityRepository;
    private final ProjectRepository projectRepository;
    private final DataWorkbenchMapper mapper;

    public DataWorkbenchConfigService(DataWorkbenchEntityRepository entityRepository,
                                      ProjectRepository projectRepository,
                                      DataWorkbenchMapper mapper) {
        this.entityRepository = entityRepository;
        this.projectRepository = projectRepository;
        this.mapper = mapper;
    }

    /**
     * 管理端全量列表，可选按平台项目过滤。
     * @param includeDisabled 是否包含停用的实体
     * @param platformProjectId 传入时仅返回该平台项目下的实体；为 null 时返回全量
     */
    public List<DataWorkbenchEntityItem> listEntities(boolean includeDisabled, Long platformProjectId) {
        List<DataWorkbenchEntity> source;
        if (platformProjectId != null) {
            source = entityRepository.findAllByPlatformProjectIdOrderByIdAsc(platformProjectId);
        } else {
            source = entityRepository.findAll();
        }
        return source.stream()
                .filter(entity -> includeDisabled || entity.isEnabled())
                .sorted(Comparator.comparing(DataWorkbenchEntity::getId))
                .map(entity -> entityRepository.findWithFieldsById(entity.getId()).orElse(entity))
                .map(mapper::toEntityItem)
                .toList();
    }

    public DataWorkbenchEntityItem getEntity(Long id) {
        return mapper.toEntityItem(requireEntity(id));
    }

    @Transactional
    public DataWorkbenchEntityItem createEntity(DataWorkbenchEntityRequest request) {
        Long platformProjectId = request.platformProjectId();
        if (entityRepository.existsByPlatformProjectIdAndEntityCodeIgnoreCase(platformProjectId, request.entityCode().trim())) {
            throw new IllegalArgumentException("该项目下实体编码已存在: " + request.entityCode());
        }
        DataWorkbenchEntity entity = new DataWorkbenchEntity();
        apply(entity, request);
        return mapper.toEntityItem(entityRepository.save(entity));
    }

    @Transactional
    public DataWorkbenchEntityItem updateEntity(Long id, DataWorkbenchEntityRequest request) {
        DataWorkbenchEntity entity = requireEntity(id);
        // 若变更了 entityCode 或 platformProjectId，需要重新做“项目内唯一”校验。
        Long currentProjectId = entity.getPlatformProject() == null ? null : entity.getPlatformProject().getId();
        boolean codeChanged = !entity.getEntityCode().equalsIgnoreCase(request.entityCode().trim());
        boolean projectChanged = currentProjectId == null || !currentProjectId.equals(request.platformProjectId());
        if ((codeChanged || projectChanged)
                && entityRepository.existsByPlatformProjectIdAndEntityCodeIgnoreCase(request.platformProjectId(), request.entityCode().trim())) {
            throw new IllegalArgumentException("该项目下实体编码已存在: " + request.entityCode());
        }
        apply(entity, request);
        return mapper.toEntityItem(entityRepository.save(entity));
    }

    @Transactional
    public void deleteEntity(Long id) {
        entityRepository.delete(requireEntity(id));
    }

    private DataWorkbenchEntity requireEntity(Long id) {
        return entityRepository.findWithFieldsById(id)
                .orElseThrow(() -> new NoSuchElementException("DataWorkbench 实体不存在: " + id));
    }

    private void apply(DataWorkbenchEntity entity, DataWorkbenchEntityRequest request) {
        validateIdentifier(request.tableName());
        validateIdentifier(request.primaryKeyColumn());
        ProjectEntity project = projectRepository.findById(request.platformProjectId())
                .orElseThrow(() -> new IllegalArgumentException("平台项目不存在: " + request.platformProjectId()));
        entity.setPlatformProject(project);
        entity.setEntityCode(request.entityCode().trim());
        entity.setEntityName(request.entityName().trim());
        entity.setDescription(defaultString(request.description()));
        entity.setTableName(request.tableName().trim());
        entity.setPrimaryKeyColumn(request.primaryKeyColumn().trim());
        entity.setMaxAffectedRows(Math.max(1, request.maxAffectedRows()));
        entity.setRequestScope(request.requestScope());
        entity.setExecuteScope(request.executeScope());
        entity.setRollbackScope(request.rollbackScope());
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.getFields().clear();
        if (request.fields() != null) {
            for (var fieldRequest : request.fields()) {
                validateIdentifier(fieldRequest.columnName());
                DataWorkbenchFieldEntity field = new DataWorkbenchFieldEntity();
                field.setEntity(entity);
                field.setFieldCode(fieldRequest.fieldCode().trim());
                field.setFieldName(fieldRequest.fieldName().trim());
                field.setColumnName(fieldRequest.columnName().trim());
                field.setDataType(fieldRequest.dataType().trim());
                field.setSynonyms(defaultString(fieldRequest.synonyms()));
                field.setUpdatable(Boolean.TRUE.equals(fieldRequest.updatable()));
                field.setLocator(Boolean.TRUE.equals(fieldRequest.locator()));
                field.setSensitive(Boolean.TRUE.equals(fieldRequest.sensitive()));
                field.setEnabled(!Boolean.FALSE.equals(fieldRequest.enabled()));
                field.setSortOrder(fieldRequest.sortOrder() == null ? 0 : fieldRequest.sortOrder());
                entity.getFields().add(field);
            }
        }
    }

    private void validateIdentifier(String value) {
        if (value == null || !SQL_IDENTIFIER.matcher(value.trim()).matches()) {
            throw new IllegalArgumentException("非法 SQL 标识符: " + value);
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
