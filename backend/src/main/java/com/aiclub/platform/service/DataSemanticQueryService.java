package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.DataWorkbenchDataSourceEntity;
import com.aiclub.platform.domain.model.DataWorkbenchQueryRequestEntity;
import com.aiclub.platform.domain.model.DataWorkbenchSemanticModelEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DataSemanticQueryDtos.DataSourceItem;
import com.aiclub.platform.dto.DataSemanticQueryDtos.SchemaTableItem;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryExecution;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryInterpretation;
import com.aiclub.platform.dto.DataSemanticQueryDtos.QueryPreview;
import com.aiclub.platform.dto.DataSemanticQueryDtos.SemanticModelItem;
import com.aiclub.platform.dto.DataSemanticQueryDtos.SemanticQueryDsl;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.DataSourceRequest;
import com.aiclub.platform.dto.request.DataSemanticQueryRequests.SemanticModelRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.DataWorkbenchDataSourceRepository;
import com.aiclub.platform.repository.DataWorkbenchQueryRequestRepository;
import com.aiclub.platform.repository.DataWorkbenchSemanticModelRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.ColumnMapRowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * DataWorkbench 语义查询编排服务。
 * 业务意图：模型只协助产生受限业务表达；表名、列名、SQL 和行级策略始终由后端已发布定义决定。
 */
@Service
@Transactional(readOnly = true)
public class DataSemanticQueryService {
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final int MAX_LIMIT = 500;
    private static final int DEFAULT_QUERY_TIMEOUT_MS = 20_000;
    private static final int DEFAULT_LOCK_TIMEOUT_MS = 2_000;
    private static final int DEFAULT_SOCKET_TIMEOUT_MS = 30_000;
    private final DataWorkbenchDataSourceRepository sourceRepository;
    private final DataWorkbenchSemanticModelRepository semanticRepository;
    private final DataWorkbenchQueryRequestRepository requestRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final AiModelConfigRepository modelRepository;
    private final ProjectDataPermissionService permissionService;
    private final TokenCipherService cipherService;
    private final ModelConfigService modelConfigService;
    private final ObjectMapper objectMapper;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final String legacyAllowedHosts;
    private final int queryTimeoutMs;
    private final int lockTimeoutMs;
    private final int socketTimeoutMs;

    public DataSemanticQueryService(DataWorkbenchDataSourceRepository sourceRepository, DataWorkbenchSemanticModelRepository semanticRepository,
                                    DataWorkbenchQueryRequestRepository requestRepository, ProjectRepository projectRepository, UserRepository userRepository,
                                    AiModelConfigRepository modelRepository, ProjectDataPermissionService permissionService, TokenCipherService cipherService,
                                    ModelConfigService modelConfigService, ObjectMapper objectMapper, PlatformEnvVarResolver platformEnvVarResolver,
                                     @Value("${platform.data-workbench.allowed-db-hosts:}") String allowedHosts,
                                     @Value("${platform.data-workbench.query-timeout-ms:20000}") int queryTimeoutMs,
                                     @Value("${platform.data-workbench.lock-timeout-ms:2000}") int lockTimeoutMs,
                                     @Value("${platform.data-workbench.socket-timeout-ms:30000}") int socketTimeoutMs) {
        this.sourceRepository = sourceRepository; this.semanticRepository = semanticRepository; this.requestRepository = requestRepository;
        this.projectRepository = projectRepository; this.userRepository = userRepository; this.modelRepository = modelRepository;
        this.permissionService = permissionService; this.cipherService = cipherService; this.modelConfigService = modelConfigService; this.objectMapper = objectMapper; this.platformEnvVarResolver = platformEnvVarResolver;
        this.legacyAllowedHosts = allowedHosts;
        this.queryTimeoutMs = Math.max(1_000, queryTimeoutMs <= 0 ? DEFAULT_QUERY_TIMEOUT_MS : queryTimeoutMs);
        this.lockTimeoutMs = Math.max(100, lockTimeoutMs <= 0 ? DEFAULT_LOCK_TIMEOUT_MS : lockTimeoutMs);
        this.socketTimeoutMs = Math.max(this.queryTimeoutMs, socketTimeoutMs <= 0 ? DEFAULT_SOCKET_TIMEOUT_MS : socketTimeoutMs);
    }

    public List<DataSourceItem> listSources(Long projectId) { requireVisibleProject(projectId); return sourceRepository.findAllByProject_IdOrderByIdAsc(projectId).stream().map(this::sourceItem).toList(); }
    /** 扫描快照按表分页返回，避免大库把全部元数据一次传到管理端。 */
    public PageResponse<SchemaTableItem> pageSchema(Long projectId, Long sourceId, int page, int size, String keyword) {
        requireEditableProject(projectId); DataWorkbenchDataSourceEntity source = requireSource(projectId, sourceId);
        String normalized = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT); List<SchemaTableItem> all = schemaTables(source).stream()
                .filter(item -> normalized.isBlank() || (item.schema() + "." + item.table()).toLowerCase(Locale.ROOT).contains(normalized)).toList();
        int safeSize = Math.max(1, Math.min(size, 100)); int total = all.size(); int from = Math.min(Math.max(0, page - 1) * safeSize, total); int to = Math.min(from + safeSize, total);
        return new PageResponse<>(all.subList(from, to), total, Math.max(1, page), safeSize, Math.max(1, (int) Math.ceil((double) total / safeSize)));
    }
    @Transactional public DataSourceItem saveSource(Long projectId, Long id, DataSourceRequest request) {
        ProjectEntity project = requireEditableProject(projectId); String jdbcUrl = request.jdbcUrl().trim(); validateJdbcUrl(jdbcUrl);
        DataWorkbenchDataSourceEntity entity = id == null ? new DataWorkbenchDataSourceEntity() : requireSource(projectId, id);
        String username = request.username().trim();
        String password = request.password();
        String allowedSchemas = normalizeSchemas(request.allowedSchemas());
        boolean connectionChanged = id == null || sourceSettingsChanged(
                decrypt(entity.getJdbcUrlCiphertext()), jdbcUrl,
                decrypt(entity.getUsernameCiphertext()), username,
                decrypt(entity.getPasswordCiphertext()), password,
                entity.getAllowedSchemas(), allowedSchemas
        );
        entity.setProject(project); entity.setName(request.name().trim()); entity.setJdbcUrlCiphertext(cipherService.encrypt(jdbcUrl));
        entity.setUsernameCiphertext(cipherService.encrypt(username)); entity.setPasswordCiphertext(cipherService.encrypt(password));
        entity.setAllowedSchemas(allowedSchemas); entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        if (connectionChanged) {
            // 连接地址、账号或 Schema 变化后，旧快照不能继续作为语义模型的物理依据。
            entity.setConfigVersion(id == null ? 1L : Math.max(1L, entity.getConfigVersion()) + 1L);
            entity.setSchemaSnapshotJson("{}");
            entity.setSchemaScannedAt(null);
        }
        return sourceItem(sourceRepository.save(entity));
    }
    @Transactional public DataSourceItem scanSource(Long projectId, Long id) {
        requireEditableProject(projectId); DataWorkbenchDataSourceEntity source = requireSource(projectId, id); Map<String, Object> snapshot = scan(source);
        source.setSchemaSnapshotJson(write(snapshot)); source.setSchemaScannedAt(LocalDateTime.now());
        // Schema 重新扫描也会改变查询物理依据，已发布模型和进行中的查询需重新建立版本快照。
        source.setConfigVersion(Math.max(1L, source.getConfigVersion()) + 1L);
        return sourceItem(sourceRepository.save(source));
    }
    public void testSource(Long projectId, Long id) { requireEditableProject(projectId); try (Connection ignored = dataSource(requireSource(projectId,id)).getConnection()) { } catch (Exception e) { throw new IllegalArgumentException("数据源连接失败：" + safeMessage(e)); } }
    public List<SemanticModelItem> listModels(Long projectId) { requireVisibleProject(projectId); return semanticRepository.findAllByProject_IdOrderByIdAsc(projectId).stream().map(this::modelItem).toList(); }
    @Transactional public SemanticModelItem saveModel(Long projectId, Long id, SemanticModelRequest request) {
        requireEditableProject(projectId); DataWorkbenchDataSourceEntity source = requireSource(projectId, request.dataSourceId()); validateDefinition(request.definitionJson(), source);
        DataWorkbenchSemanticModelEntity entity = id == null ? new DataWorkbenchSemanticModelEntity() : requireModel(projectId, id);
        entity.setProject(requireProject(projectId)); entity.setDataSource(source); entity.setName(request.name().trim()); entity.setDraftDefinitionJson(request.definitionJson()); entity.setModelConfigId(validateModel(request.modelConfigId()));
        return modelItem(semanticRepository.save(entity));
    }
    @Transactional public SemanticModelItem publishModel(Long projectId, Long id) {
        requireEditableProject(projectId); DataWorkbenchSemanticModelEntity entity = requireModel(projectId,id); validateDefinition(entity.getDraftDefinitionJson(), entity.getDataSource());
        entity.setPublishedDefinitionJson(entity.getDraftDefinitionJson()); entity.setPublishedSchemaSnapshotJson(entity.getDataSource().getSchemaSnapshotJson()); entity.setVersionNo(entity.getVersionNo()+1); entity.setStatus("PUBLISHED");
        entity.setDataSourceVersion(entity.getDataSource().getConfigVersion());
        if (entity.getModelConfigId()!=null) { AiModelConfigEntity model=modelRepository.findById(entity.getModelConfigId()).orElseThrow(()->new IllegalArgumentException("模型配置不存在")); entity.setModelNameSnapshot(model.getName()); entity.setModelProviderSnapshot(model.getProvider()); entity.setModelIdentifierSnapshot(model.getModelName()); }
        return modelItem(semanticRepository.save(entity));
    }
    @Transactional public QueryInterpretation interpret(Long projectId, Long modelId, String text) {
        ProjectEntity project=requireVisibleProject(projectId); DataWorkbenchSemanticModelEntity model=requirePublishedModel(projectId,modelId); requireUsablePublishedModel(model); JsonNode definition=readTree(model.getPublishedDefinitionJson());
        SemanticQueryDsl dsl=interpretDsl(model, definition, text); List<String> notes=new ArrayList<>(); if(dsl.measures().isEmpty() && dsl.dimensions().isEmpty()) notes.add("未能确定要查询的业务概念，请明确指标或维度。");
        DataWorkbenchQueryRequestEntity request=new DataWorkbenchQueryRequestEntity(); request.setProject(project); request.setSemanticModel(model); request.setDataSource(model.getDataSource()); request.setRequesterUser(currentUser()); request.setOriginalText(text.trim()); request.setDslJson(write(dsl)); request.setSemanticVersionNo(model.getVersionNo()); request.setDataSourceVersion(model.getDataSource().getConfigVersion()); request.setDefinitionSnapshotJson(model.getPublishedDefinitionJson()); request.setSchemaSnapshotJson(model.getPublishedSchemaSnapshotJson()); request.setInterpretationJson(write(Map.of("normalizedTerms", dsl.measures(), "clarifications", notes))); request.setStatus(notes.isEmpty()?"INTERPRETED":"CLARIFY"); requestRepository.save(request);
        return new QueryInterpretation(request.getId(), request.getStatus(), dsl.measures(), merge(dsl.measures(),dsl.dimensions()), notes, dsl);
    }
    @Transactional public QueryPreview preview(Long projectId, Long requestId) {
        requireVisibleProject(projectId); DataWorkbenchQueryRequestEntity request=requireRequest(projectId,requestId); if(!"INTERPRETED".equals(request.getStatus())) throw new IllegalArgumentException("当前查询需要先澄清后才能预览");
        requireCurrentQueryDataSource(projectId, request); CompiledQuery compiled=compile(request, parseDsl(request.getDslJson())); request.setPreviewToken(UUID.randomUUID().toString()); request.setSqlSummary(compiled.summary()); request.setStatus("PREVIEWED"); requestRepository.save(request);
        return new QueryPreview(request.getId(),request.getPreviewToken(),parseDsl(request.getDslJson()),compiled.summary(),compiled.concepts(),List.of());
    }
    @Transactional public QueryExecution execute(Long projectId, Long requestId, String token) {
        requireVisibleProject(projectId); DataWorkbenchQueryRequestEntity request=requireRequest(projectId,requestId); if(!"PREVIEWED".equals(request.getStatus()) || !Objects.equals(request.getPreviewToken(), token)) throw new IllegalArgumentException("预览令牌无效或已使用，请重新预览");
        if(request.getRequesterUser()==null || !request.getRequesterUser().getId().equals(currentUser().getId())) throw new IllegalArgumentException("只能确认自己发起的预览查询");
        DataWorkbenchDataSourceEntity source=requireCurrentQueryDataSource(projectId, request); CompiledQuery compiled=compile(request,parseDsl(request.getDslJson())); List<Map<String,Object>> rows=query(source,compiled); String summary=summarize(request.getSemanticModel(),rows,compiled);
        request.setResultSummary(summary); request.setStatus("EXECUTED"); request.setExecutedAt(LocalDateTime.now()); request.setPreviewToken(""); requestRepository.save(request); return new QueryExecution(request.getId(),"EXECUTED",rows,summary,compiled.summary());
    }

    private SemanticQueryDsl interpretDsl(DataWorkbenchSemanticModelEntity model, JsonNode definition, String text) {
        String lower=text.toLowerCase(Locale.ROOT); List<String> measures=new ArrayList<>(), dimensions=new ArrayList<>(); Map<String,Object> filters=new LinkedHashMap<>(); JsonNode concepts=definition.path("concepts");
        Map<String,String> synonyms=readMap(definition.path("synonyms")); for(JsonNode c:concepts){String code=c.path("code").asText(); String name=c.path("name").asText(); String kind=c.path("kind").asText("DIMENSION"); if(lower.contains(code.toLowerCase(Locale.ROOT))||(!name.isBlank()&&text.contains(name))||synonyms.entrySet().stream().anyMatch(e->e.getValue().equals(code)&&text.contains(e.getKey()))){if("MEASURE".equalsIgnoreCase(kind))measures.add(code);else dimensions.add(code);}}
        if(measures.isEmpty()) for(JsonNode c:concepts) if("MEASURE".equalsIgnoreCase(c.path("kind").asText())) { measures.add(c.path("code").asText()); break; }
        JsonNode enums=definition.path("enums"); enums.fields().forEachRemaining(e->{e.getValue().fields().forEachRemaining(item->{if(text.contains(item.getKey())) filters.put(e.getKey(),item.getValue().asText());});});
        if(measures.isEmpty() && model.getModelConfigId()!=null) { try { String answer=modelConfigService.invokePromptWithUsage(model.getModelConfigId(),"只输出 JSON：{measures:[概念编码],dimensions:[概念编码],filters:{字段:值}}，不得输出 SQL。", "可用概念："+concepts+"\n问题："+text).text(); JsonNode ai=readTree(answer); ai.path("measures").forEach(n->measures.add(n.asText())); ai.path("dimensions").forEach(n->dimensions.add(n.asText())); ai.path("filters").fields().forEachRemaining(e->filters.put(e.getKey(),e.getValue().asText())); } catch(Exception ignored) { } }
        return new SemanticQueryDsl("1",model.getId(),List.copyOf(new LinkedHashSet<>(measures)),List.copyOf(new LinkedHashSet<>(dimensions)),Map.copyOf(filters),100);
    }
    private CompiledQuery compile(DataWorkbenchQueryRequestEntity request, SemanticQueryDsl dsl) {
        if(!request.getSemanticModel().getId().equals(dsl.semanticModelId()) || request.getSemanticVersionNo() <= 0) throw new IllegalArgumentException("语义模型版本或 DSL 不匹配"); JsonNode d=readTree(request.getDefinitionSnapshotJson()); String table=resolveTableReference(d.path("table").asText(), readTree(request.getSchemaSnapshotJson())); Map<String,JsonNode> concepts=new LinkedHashMap<>(); d.path("concepts").forEach(c->concepts.put(c.path("code").asText(),c));
        List<String> selects=new ArrayList<>(), groups=new ArrayList<>(), used=new ArrayList<>(); for(String code:dsl.measures()){JsonNode c=requireConcept(concepts,code); rejectSensitive(c); String col=safeIdentifier(c.path("column").asText()); String agg=c.path("aggregation").asText("COUNT").toUpperCase(Locale.ROOT); if(!Set.of("COUNT","COUNT_DISTINCT","SUM","AVG","MIN","MAX").contains(agg))throw new IllegalArgumentException("不支持的聚合方式"); String expr="COUNT_DISTINCT".equals(agg)?"COUNT(DISTINCT "+col+")":agg+"("+col+")"; selects.add(expr+" AS "+safeIdentifier(code)); used.add(code);}
        for(String code:dsl.dimensions()){JsonNode c=requireConcept(concepts,code); rejectSensitive(c); String col=safeIdentifier(c.path("column").asText()); selects.add(col+" AS "+safeIdentifier(code)); groups.add(col); used.add(code);} if(selects.isEmpty())throw new IllegalArgumentException("DSL 缺少可执行概念");
        MapSqlParameterSource params=new MapSqlParameterSource(); List<String> where=new ArrayList<>(); int index=0; for(var e:dsl.filters().entrySet()){JsonNode c=requireConcept(concepts,e.getKey()); String param="f"+(index++); where.add(safeIdentifier(c.path("column").asText())+" = :"+param); params.addValue(param,e.getValue());}
        for(JsonNode policy:d.path("policies")){String col=safeIdentifier(policy.path("column").asText()); if("PROJECT_ID".equals(policy.path("context").asText())){where.add(col+" = :policyProjectId"); params.addValue("policyProjectId",request.getProject().getId());}}
        String sql="SELECT "+String.join(", ",selects)+" FROM "+table+(where.isEmpty()?"":" WHERE "+String.join(" AND ",where))+(groups.isEmpty()?"":" GROUP BY "+String.join(", ",groups))+" LIMIT "+Math.min(MAX_LIMIT,Math.max(1,dsl.limit())); if(sql.contains(";")||!sql.startsWith("SELECT "))throw new IllegalArgumentException("非法查询语句"); return new CompiledQuery(sql,sql.replaceAll(":[A-Za-z0-9_]+","?"),params,used);
    }
    private List<Map<String,Object>> query(DataWorkbenchDataSourceEntity source, CompiledQuery query){ requireEnabledSource(source); try { DriverManagerDataSource dataSource=dataSource(source); return new NamedParameterJdbcTemplate(dataSource).query(query.sql(),query.params(),new ColumnMapRowMapper()); } catch(Exception e){throw new IllegalArgumentException("只读查询执行失败："+safeMessage(e));} }
    private String summarize(DataWorkbenchSemanticModelEntity model,List<Map<String,Object>> rows,CompiledQuery query){String fallback="查询完成，共返回 "+rows.size()+" 行，使用概念："+String.join("、",query.concepts())+"。"; if(model.getModelConfigId()==null)return fallback; try{return modelConfigService.invokePromptWithUsage(model.getModelConfigId(),"根据已脱敏 JSON 结果写一句中文数据总结，不得编造。",write(rows)).text();}catch(Exception e){return fallback;}}
    private Map<String,Object> scan(DataWorkbenchDataSourceEntity source){List<Map<String,Object>> tables=new ArrayList<>(); try(Connection c=dataSource(source).getConnection()){DatabaseMetaData meta=c.getMetaData(); for(String schema:source.getAllowedSchemas().split(",")){try(ResultSet rs=meta.getTables(null,schema.trim(),"%",new String[]{"TABLE"})){while(rs.next()){Map<String,Object> t=new LinkedHashMap<>();t.put("schema",rs.getString("TABLE_SCHEM"));t.put("table",rs.getString("TABLE_NAME"));List<String> cols=new ArrayList<>();try(ResultSet cr=meta.getColumns(null,rs.getString("TABLE_SCHEM"),rs.getString("TABLE_NAME"),"%")){while(cr.next())cols.add(cr.getString("COLUMN_NAME"));}t.put("columns",cols);tables.add(t);}}}}catch(Exception e){throw new IllegalArgumentException("Schema 扫描失败："+safeMessage(e));} return Map.of("tables",tables);}
    private DriverManagerDataSource dataSource(DataWorkbenchDataSourceEntity source){String url=cipherService.decrypt(source.getJdbcUrlCiphertext());validateJdbcUrl(url);DriverManagerDataSource d=new DriverManagerDataSource();d.setDriverClassName("org.postgresql.Driver");d.setUrl(url);d.setUsername(cipherService.decrypt(source.getUsernameCiphertext()));d.setPassword(cipherService.decrypt(source.getPasswordCiphertext()));Properties properties=new Properties();properties.setProperty("connectTimeout",String.valueOf(Math.max(1, socketTimeoutMs / 1000)));properties.setProperty("socketTimeout",String.valueOf(Math.max(1, socketTimeoutMs / 1000)));properties.setProperty("options","-c statement_timeout="+queryTimeoutMs+" -c lock_timeout="+lockTimeoutMs+" -c idle_in_transaction_session_timeout="+socketTimeoutMs+" -c default_transaction_read_only=on");d.setConnectionProperties(properties);return d;}
    private void validateJdbcUrl(String url){try{if(url==null||!url.startsWith("jdbc:postgresql://"))throw new IllegalArgumentException("仅支持 PostgreSQL JDBC URL");String host=new URI(url.substring(5)).getHost();Set<String> allowedHosts=resolveAllowedHosts();if(host==null||allowedHosts.isEmpty()||!allowedHosts.contains(host.toLowerCase(Locale.ROOT)))throw new IllegalArgumentException("数据源主机未在“环境变量管理 / 数据工作台数据库主机白名单”中配置");}catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("非法 PostgreSQL JDBC URL");}}
    private void validateDefinition(String definition, DataWorkbenchDataSourceEntity source) {
        JsonNode d = readTree(definition);
        if (!d.path("concepts").isArray() || d.path("concepts").isEmpty()) {
            throw new IllegalArgumentException("语义定义至少需要一个概念");
        }
        if (source.getSchemaScannedAt() == null) {
            throw new IllegalArgumentException("请先完成数据源 Schema 扫描");
        }
        JsonNode snapshot = readTree(source.getSchemaSnapshotJson());
        JsonNode table = findSnapshotTable(d.path("table").asText(), snapshot);
        for (JsonNode concept : d.path("concepts")) {
            String code = safeIdentifier(concept.path("code").asText());
            String column = safeIdentifier(concept.path("column").asText());
            boolean columnFound = false;
            for (JsonNode item : table.path("columns")) {
                if (column.equals(item.asText())) {
                    columnFound = true;
                    break;
                }
            }
            if (!columnFound) {
                throw new IllegalArgumentException("语义概念「" + code + "」引用的列不在 Schema 快照中");
            }
        }
    }
    private Long validateModel(Long id){if(id==null)return null;AiModelConfigEntity m=modelRepository.findById(id).orElseThrow(()->new IllegalArgumentException("模型配置不存在"));if(!Boolean.TRUE.equals(m.getEnabled())||!"CHAT".equalsIgnoreCase(m.getModelType()))throw new IllegalArgumentException("语义查询仅允许绑定启用的对话模型");return id;}
    private DataWorkbenchDataSourceEntity requireSource(Long projectId, Long id) { return sourceRepository.findByIdAndProject_Id(id, projectId).orElseThrow(() -> new NoSuchElementException("数据源不存在")); }
    private DataWorkbenchSemanticModelEntity requireModel(Long projectId, Long id) { return semanticRepository.findByIdAndProject_Id(id, projectId).orElseThrow(() -> new NoSuchElementException("语义模型不存在")); }
    private DataWorkbenchSemanticModelEntity requirePublishedModel(Long projectId, Long id) {
        DataWorkbenchSemanticModelEntity model = requireModel(projectId, id);
        if (!"PUBLISHED".equals(model.getStatus())) throw new IllegalArgumentException("请使用已发布的语义模型");
        return model;
    }
    private DataWorkbenchQueryRequestEntity requireRequest(Long projectId, Long id) { return requestRepository.findByIdAndProject_Id(id, projectId).orElseThrow(() -> new NoSuchElementException("查询请求不存在")); }

    /** 发布模型、预览和执行均必须确认数据源仍是启用状态。 */
    static void requireEnabledSource(DataWorkbenchDataSourceEntity source) {
        if (source == null || !source.isEnabled()) throw new IllegalStateException("数据源已停用，无法执行语义查询");
    }

    private void requireUsablePublishedModel(DataWorkbenchSemanticModelEntity model) {
        DataWorkbenchDataSourceEntity source = model.getDataSource();
        requireEnabledSource(source);
        if (source.getSchemaScannedAt() == null
                || source.getConfigVersion() != model.getDataSourceVersion()
                || !sameJson(source.getSchemaSnapshotJson(), model.getPublishedSchemaSnapshotJson())) {
            throw new IllegalStateException("数据源 Schema 或连接配置已变化，请重新扫描并发布语义模型");
        }
    }

    private DataWorkbenchDataSourceEntity requireCurrentQueryDataSource(Long projectId, DataWorkbenchQueryRequestEntity request) {
        if (request.getDataSource() == null) throw new IllegalStateException("查询缺少数据源快照");
        DataWorkbenchDataSourceEntity source = requireSource(projectId, request.getDataSource().getId());
        requireEnabledSource(source);
        if (source.getConfigVersion() != request.getDataSourceVersion()) {
            throw new IllegalStateException("数据源配置已变化，请重新发起查询");
        }
        return source;
    }
    private ProjectEntity requireProject(Long id){return projectRepository.findById(id).orElseThrow(()->new NoSuchElementException("项目不存在"));} private ProjectEntity requireVisibleProject(Long id){ProjectEntity p=requireProject(id);permissionService.requireProjectVisible(p);return p;} private ProjectEntity requireEditableProject(Long id){ProjectEntity p=requireProject(id);permissionService.requireProjectEditable(p);return p;} private UserEntity currentUser(){Long id=AuthContextHolder.get().orElseThrow().userId();return userRepository.findById(id).orElseThrow();}
    private List<SchemaTableItem> schemaTables(DataWorkbenchDataSourceEntity s){List<SchemaTableItem> tables=new ArrayList<>();readTree(s.getSchemaSnapshotJson()).path("tables").forEach(t->{List<String> columns=new ArrayList<>();t.path("columns").forEach(c->columns.add(c.asText()));tables.add(new SchemaTableItem(t.path("schema").asText(),t.path("table").asText(),columns));});return tables;} private DataSourceItem sourceItem(DataWorkbenchDataSourceEntity s){List<SchemaTableItem> tables=schemaTables(s);return new DataSourceItem(s.getId(),s.getName(),s.getAllowedSchemas(),s.isEnabled(),!s.getJdbcUrlCiphertext().isBlank(),s.getSchemaScannedAt()==null?null:s.getSchemaScannedAt().toString(),tables);} private SemanticModelItem modelItem(DataWorkbenchSemanticModelEntity m){return new SemanticModelItem(m.getId(),m.getDataSource().getId(),m.getName(),m.getVersionNo(),m.getStatus(),m.getModelConfigId(),m.getDraftDefinitionJson(),m.getPublishedDefinitionJson());}
    private JsonNode readTree(String v){try{return objectMapper.readTree(v==null?"{}":v);}catch(Exception e){throw new IllegalArgumentException("JSON 格式无效");}} private String write(Object v){try{return objectMapper.writeValueAsString(v);}catch(Exception e){throw new IllegalStateException("JSON 序列化失败",e);}} private SemanticQueryDsl parseDsl(String v){try{return objectMapper.readValue(v,SemanticQueryDsl.class);}catch(Exception e){throw new IllegalArgumentException("DSL 格式无效");}} private Map<String,String> readMap(JsonNode n){Map<String,String> r=new LinkedHashMap<>();if(n.isObject())n.fields().forEachRemaining(e->r.put(e.getKey(),e.getValue().asText()));return r;}
    private Set<String> resolveAllowedHosts(){String value=platformEnvVarResolver.resolveOrDefault(PlatformEnvVarRegistry.KEY_DATA_WORKBENCH_ALLOWED_DB_HOSTS,()->legacyAllowedHosts,"");return Arrays.stream(value.split(",")).map(String::trim).filter(v->!v.isEmpty()).map(v->v.toLowerCase(Locale.ROOT)).collect(java.util.stream.Collectors.toSet());} private JsonNode requireConcept(Map<String,JsonNode> cs,String code){JsonNode c=cs.get(code);if(c==null)throw new IllegalArgumentException("未授权的业务概念："+code);return c;} private void rejectSensitive(JsonNode concept){if(concept.path("sensitive").asBoolean(false))throw new IllegalArgumentException("敏感概念不允许在语义查询中直接返回");} private String safeIdentifier(String s){if(s==null||!IDENTIFIER.matcher(s).matches())throw new IllegalArgumentException("非法物理标识符");return s;} private String safeTable(String s){String[] parts=(s==null?"":s).split("\\.");if(parts.length<1||parts.length>2)throw new IllegalArgumentException("非法物理表名");for(String p:parts)safeIdentifier(p);return String.join(".",parts);} private String normalizeSchemas(String s){String v=s==null||s.isBlank()?"public":s.trim();for(String p:v.split(","))safeIdentifier(p.trim());return v;} private String safeMessage(Exception e){String m=e.getMessage();return m==null?"未知错误":m.length()>300?m.substring(0,300):m;} private static List<String> merge(List<String>a,List<String>b){List<String> r=new ArrayList<>(a);r.addAll(b);return r;}

    /** 将未限定表名解析为 Schema 全限定名，避免依赖 PostgreSQL search_path 命中错误表。 */
    private String resolveTableReference(String rawTable, JsonNode snapshot) {
        return findSnapshotTable(rawTable, snapshot).path("schema").asText() + "." + findSnapshotTable(rawTable, snapshot).path("table").asText();
    }

    private JsonNode findSnapshotTable(String rawTable, JsonNode snapshot) {
        String table = safeTable(rawTable);
        String[] parts = table.split("\\.");
        List<JsonNode> matches = new ArrayList<>();
        for (JsonNode item : snapshot.path("tables")) {
            boolean matched = parts.length == 2
                    ? parts[0].equals(item.path("schema").asText()) && parts[1].equals(item.path("table").asText())
                    : parts[0].equals(item.path("table").asText());
            if (matched) matches.add(item);
        }
        if (matches.isEmpty()) throw new IllegalArgumentException("语义定义引用的表不在当前 Schema 快照中");
        if (parts.length == 1 && matches.size() > 1) throw new IllegalArgumentException("同名表存在于多个 Schema，请使用 schema.table");
        return matches.get(0);
    }

    static boolean sourceSettingsChanged(String oldJdbcUrl, String newJdbcUrl,
                                          String oldUsername, String newUsername,
                                          String oldPassword, String newPassword,
                                          String oldSchemas, String newSchemas) {
        return !Objects.equals(oldJdbcUrl, newJdbcUrl)
                || !Objects.equals(oldUsername, newUsername)
                || !Objects.equals(oldPassword, newPassword)
                || !Objects.equals(oldSchemas, newSchemas);
    }

    private boolean sameJson(String left, String right) {
        return readTree(left).equals(readTree(right));
    }

    private String decrypt(String ciphertext) {
        return ciphertext == null || ciphertext.isBlank() ? "" : cipherService.decrypt(ciphertext);
    }
    private record CompiledQuery(String sql,String summary,MapSqlParameterSource params,List<String> concepts) { }
}
