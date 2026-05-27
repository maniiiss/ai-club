package com.aiclub.platform.service;

import com.aiclub.platform.dto.AiClubPipelineConfigTemplateItem;
import com.aiclub.platform.dto.AiClubPipelineConfigTemplateParameterItem;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.function.Function;

/**
 * AI Club Pipeline 内置 Woodpecker 参数化模板。
 * 普通用户通过页面表单维护模板元素，高级用户仍可切换到手动 YAML 编辑路径。
 */
@Service
public class AiClubPipelineConfigTemplateService {

    public static final String TEMPLATE_DOCKER_BUILDX = "DOCKER_BUILDX";
    public static final String TEMPLATE_SSH_REMOTE = "SSH_REMOTE";
    public static final String PREFILL_MODE_FORM = "FORM";
    public static final String PREFILL_MODE_MANUAL = "MANUAL";

    private static final String DEFAULT_CONFIG_PATH = ".woodpecker.yml";
    private static final String DEFAULT_BRANCH = "main";
    private static final String DEFAULT_PIPELINE_NAME = "AI Club Pipeline";
    private static final String DEFAULT_GITLAB_PROJECT_PATH = "group/repo";
    private static final String METADATA_TEMPLATE_PREFIX = "# ai-club:template=";
    private static final String METADATA_VERSION_PREFIX = "# ai-club:version=";
    private static final String METADATA_PARAMETER_PREFIX = "# ai-club:param:";
    private static final String METADATA_VERSION = "1";

    private static final String TYPE_TEXT = "text";
    private static final String TYPE_PASSWORD = "password";
    private static final String TYPE_TEXTAREA = "textarea";
    private static final String TYPE_SWITCH = "switch";
    private static final String TYPE_SELECT = "select";
    private static final String PARAM_SKIP_CLONE = "skipClone";
    private static final String CONNECTION_DIRECT_SSH = "DIRECT_SSH";
    private static final String CONNECTION_JUMPSERVER = "JUMPSERVER";
    private static final String PARAM_CONNECTION_TYPE = "connectionType";
    private static final String PARAM_DIRECT_SSH_HOST = "directSshHost";
    private static final String PARAM_DIRECT_SSH_PORT = "directSshPort";
    private static final String PARAM_DIRECT_SSH_USER = "directSshUser";
    private static final String PARAM_DIRECT_SSH_PRIVATE_KEY = "directSshPrivateKey";
    private static final String PARAM_JUMP_SERVER_HOST = "jumpServerHost";
    private static final String PARAM_JUMP_SERVER_PORT = "jumpServerPort";
    private static final String PARAM_JUMP_SERVER_USER = "jumpServerUser";
    private static final String PARAM_JUMP_SERVER_PRIVATE_KEY = "jumpServerPrivateKey";
    private static final String PARAM_JUMP_TARGET_USER = "jumpTargetUser";
    private static final String PARAM_JUMP_TARGET_ASSET_IP = "jumpTargetAssetIp";
    private static final String PARAM_PROJECT_ROOT = "projectRoot";
    private static final String PARAM_SERVER_DEPLOY_ENABLED = "serverDeployEnabled";
    private static final String PARAM_SERVER_DEPLOY_CONNECTION_TYPE = "serverDeployConnectionType";
    private static final String PARAM_SERVER_DEPLOY_DIRECT_HOST = "serverDeployDirectHost";
    private static final String PARAM_SERVER_DEPLOY_DIRECT_PORT = "serverDeployDirectPort";
    private static final String PARAM_SERVER_DEPLOY_DIRECT_USER = "serverDeployDirectUser";
    private static final String PARAM_SERVER_DEPLOY_DIRECT_PRIVATE_KEY = "serverDeployDirectPrivateKey";
    private static final String PARAM_SERVER_DEPLOY_JUMP_HOST = "serverDeployJumpHost";
    private static final String PARAM_SERVER_DEPLOY_JUMP_PORT = "serverDeployJumpPort";
    private static final String PARAM_SERVER_DEPLOY_JUMP_USER = "serverDeployJumpUser";
    private static final String PARAM_SERVER_DEPLOY_JUMP_PRIVATE_KEY = "serverDeployJumpPrivateKey";
    private static final String PARAM_SERVER_DEPLOY_JUMP_TARGET_USER = "serverDeployJumpTargetUser";
    private static final String PARAM_SERVER_DEPLOY_JUMP_TARGET_ASSET_IP = "serverDeployJumpTargetAssetIp";
    private static final String PARAM_SERVER_DEPLOY_SOURCE_PATH = "serverDeploySourcePath";
    private static final String PARAM_SERVER_DEPLOY_REMOTE_PATH = "serverDeployRemotePath";
    private static final String PARAM_SERVER_DEPLOY_COMMANDS = "serverDeployCommands";

    private final List<TemplateDefinition> templates = List.of(
            new TemplateDefinition(
                    "JAVA_MAVEN",
                    "Java / Maven",
                    "适用于 Spring Boot、Maven 多模块或普通 Java 服务。",
                    "后端服务",
                    false,
                    List.of("仓库根目录存在 pom.xml", "可通过表单调整 Maven 镜像、测试命令和打包命令", "如需部署到服务器，可打开后置部署开关并填写 SSH / 上传 / 重启参数"),
                    combineParameters(buildProjectRootParameters(), buildCloneBehaviorParameters(), List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                            parameter("javaImage", "Maven 镜像", TYPE_TEXT, true, "maven:3.9-eclipse-temurin-17", "maven:3.9-eclipse-temurin-17", "Woodpecker 步骤运行镜像", false),
                            parameter("testCommand", "测试命令", TYPE_TEXTAREA, true, "if [ -x ./mvnw ]; then ./mvnw -B test; else mvn -B test; fi", "mvn -B test", "支持多行命令，平台会逐行写入 commands", false),
                            parameter("packageCommand", "打包命令", TYPE_TEXTAREA, true, "if [ -x ./mvnw ]; then ./mvnw -B -DskipTests package; else mvn -B -DskipTests package; fi", "mvn -B -DskipTests package", "按需调整为 deploy、verify 或自定义脚本", false)
                    ), postDeployParameters("target/*.jar", "/srv/app/app.jar", "cd /srv/app\n./restart.sh")),
                    this::renderJavaMaven
            ),
            new TemplateDefinition(
                    "NODE_VITE",
                    "Node / Vite",
                    "适用于 Vue、Vite、React 等 Node 前端项目。",
                    "前端应用",
                    false,
                    List.of("仓库根目录存在 package.json", "可配置 Node 镜像、安装命令、构建命令和触发分支", "如需部署到服务器，可打开后置部署开关并上传构建产物目录"),
                    combineParameters(buildProjectRootParameters(), buildCloneBehaviorParameters(), List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                            parameter("nodeImage", "Node 镜像", TYPE_TEXT, true, "node:20-alpine", "node:20-alpine", "Woodpecker 步骤运行镜像", false),
                            parameter("installCommand", "安装命令", TYPE_TEXTAREA, true, "if [ -f package-lock.json ]; then npm ci; else npm install; fi", "npm ci", "支持 pnpm、yarn 或企业源安装命令", false),
                            parameter("buildCommand", "构建命令", TYPE_TEXTAREA, true, "npm run build --if-present", "npm run build", "支持多行构建与检查命令", false)
                    ), postDeployParameters("dist", "/srv/app/dist", "cd /srv/app\n./restart.sh")),
                    this::renderNodeVite
            ),
            new TemplateDefinition(
                    "PYTHON_FASTAPI",
                    "Python / FastAPI",
                    "适用于 FastAPI、pytest 或普通 Python 服务。",
                    "后端服务",
                    false,
                    List.of("优先安装 requirements.txt", "可通过表单调整 Python 镜像、依赖安装和验证命令", "如需部署到服务器，可打开后置部署开关并上传构建产物或应用目录"),
                    combineParameters(buildProjectRootParameters(), buildCloneBehaviorParameters(), List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                            parameter("pythonImage", "Python 镜像", TYPE_TEXT, true, "python:3.12-slim", "python:3.12-slim", "Woodpecker 步骤运行镜像", false),
                            parameter("installCommand", "依赖安装命令", TYPE_TEXTAREA, true, "python -m pip install --upgrade pip\nif [ -f requirements.txt ]; then pip install -r requirements.txt; fi", "pip install -r requirements.txt", "支持 poetry、uv 或私有源安装命令", false),
                            parameter("verifyCommand", "验证命令", TYPE_TEXTAREA, true, "if python -c \"import pytest\" >/dev/null 2>&1 && [ -d tests ]; then python -m pytest; else python -m compileall .; fi", "python -m pytest", "支持多行测试、类型检查或静态扫描命令", false)
                    ), postDeployParameters("", "", "cd /srv/app\n./restart.sh")),
                    this::renderPythonFastapi
            ),
            new TemplateDefinition(
                    TEMPLATE_DOCKER_BUILDX,
                    "Docker 镜像构建并推送",
                    "适用于需要构建并推送容器镜像的项目。",
                    "镜像构建",
                    true,
                    List.of("仓库根目录存在 Dockerfile", "页面填写 registry、镜像名和推送账号，密码写入 Woodpecker repo secret", "Woodpecker runner 允许 Docker Buildx 插件构建与推送镜像", "如需部署到服务器，可打开后置部署开关，在镜像推送后执行远程重启脚本"),
                    combineParameters(buildProjectRootParameters(), buildCloneBehaviorParameters(), List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "push/manual 事件写入 when.branch，tag 事件不限制分支", false),
                            parameter("registryUrl", "推送服务器地址", TYPE_TEXT, true, "", "registry.example.com 或 registry.example.com:5000", "写入 plugin-docker-buildx 的 registry", false),
                            parameter("imageRepo", "镜像仓库名", TYPE_TEXT, false, "", "留空按 registry/项目路径生成", "例如 registry.example.com/team/app；留空时保留 GitLab 路径层级并转小写", false),
                            parameter("dockerfile", "Dockerfile 路径", TYPE_TEXT, true, "Dockerfile", "Dockerfile", "相对仓库根目录的 Dockerfile 路径", false),
                            parameter("tags", "镜像 Tag", TYPE_TEXTAREA, true, "latest\n${CI_COMMIT_SHA}", "latest", "每行一个 tag，默认写入 latest 与提交 SHA", false),
                            parameter("registryUsername", "推送账号", TYPE_TEXT, true, "", "registry 用户名或机器人账号", "不会写入 YAML，平台会写入 Woodpecker repo secret", true),
                            parameter("registryPassword", "推送密码 / Token", TYPE_PASSWORD, true, "", "registry 密码或访问 Token", "不会写入 YAML，平台会写入 Woodpecker repo secret", true),
                            parameter("registryInsecure", "允许非安全 registry", TYPE_SWITCH, false, "false", "", "内网 http registry 或自签证书场景可开启", false)
                    ), postDeployParameters("", "", "cd /srv/app\n./restart.sh")),
                    this::renderDockerBuildx
            ),
            new TemplateDefinition(
                    TEMPLATE_SSH_REMOTE,
                    "SSH 远程部署",
                    "适用于构建后通过 SSH 在目标服务器执行发布脚本。",
                    "远程部署",
                    false,
                    List.of(
                            "支持直连服务器或经 JumpServer 连接目标资产，两种模式在页面中显式区分",
                            "私钥只会写入 Woodpecker repo secret，不会明文进入 YAML",
                            "JumpServer 模式要求堡垒机支持无交互、公钥登录和直连资产账号，不适用于需要 MFA、审批或手工输入资产账号密码的场景"
                    ),
                    combineParameters(buildCloneBehaviorParameters(), buildSshRemoteParameters()),
                    this::renderSshRemote
            ),
            new TemplateDefinition(
                    "GENERIC_SHELL",
                    "通用 Shell",
                    "适用于暂时只需要跑基础检查命令的仓库。",
                    "通用",
                    false,
                    List.of("默认使用 Alpine 镜像", "可通过表单调整镜像、分支和 Shell 命令", "如需部署到服务器，也可以打开后置部署开关"),
                    combineParameters(buildProjectRootParameters(), buildCloneBehaviorParameters(), List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                            parameter("shellImage", "运行镜像", TYPE_TEXT, true, "alpine:3.20", "alpine:3.20", "Woodpecker 步骤运行镜像", false),
                            parameter("shellCommands", "Shell 命令", TYPE_TEXTAREA, true, "set -eu\npwd\nls -la\nif [ -f README.md ]; then sed -n '1,40p' README.md; fi", "set -eu", "支持多行命令，平台会逐行写入 commands", false)
                    ), postDeployParameters("", "", "cd /srv/app\n./restart.sh")),
                    this::renderGenericShell
            )
    );

    public List<AiClubPipelineConfigTemplateItem> listTemplates() {
        return listTemplates(TemplateRenderContext.defaultPreview());
    }

    public List<AiClubPipelineConfigTemplateItem> listTemplates(TemplateRenderContext context) {
        TemplateRenderContext safeContext = normalizeContext(context);
        return templates.stream()
                .map(template -> toItem(template, safeContext))
                .toList();
    }

    public AiClubPipelineConfigTemplateItem requireTemplateItem(String code) {
        return requireTemplateItem(code, TemplateRenderContext.defaultPreview());
    }

    public AiClubPipelineConfigTemplateItem requireTemplateItem(String code, TemplateRenderContext context) {
        return toItem(requireTemplate(code), normalizeContext(context));
    }

    public String renderTemplate(String code, String pipelineName, String branch) {
        return renderTemplate(code, new TemplateRenderContext(
                null,
                pipelineName,
                branch,
                DEFAULT_GITLAB_PROJECT_PATH
        ), Map.of());
    }

    public String renderTemplate(String code, TemplateRenderContext context, Map<String, String> parameters) {
        TemplateDefinition template = requireTemplate(code);
        TemplateRenderContext safeContext = normalizeContext(context);
        Map<String, String> effectiveParameters = new LinkedHashMap<>(buildDefaultParameterValues(template, safeContext));
        effectiveParameters.putAll(normalizeParameters(parameters));
        validateRequiredVisibleParameters(template, safeContext, effectiveParameters);
        String renderedContent = template.renderer().render(new TemplateRenderInput(safeContext, effectiveParameters));
        return prependTemplateMetadata(template, effectiveParameters, renderedContent);
    }

    /**
     * 修改配置时优先按平台模板元数据回填；无法命中元数据时，再尝试对当前高频模板做有限识别。
     */
    public TemplatePrefillResult parseExistingConfig(String rawContent, TemplateRenderContext context) {
        TemplateRenderContext safeContext = normalizeContext(context);
        if (!hasText(rawContent)) {
            return new TemplatePrefillResult(PREFILL_MODE_MANUAL, null, Map.of(), "", "仓库配置内容为空，已回退手动 YAML 模式");
        }
        MetadataSnapshot metadataSnapshot = extractMetadata(rawContent);
        if (hasText(metadataSnapshot.templateCode())) {
            try {
                TemplateDefinition template = requireTemplate(metadataSnapshot.templateCode());
                Map<String, String> parameters = new LinkedHashMap<>(buildDefaultParameterValues(template, safeContext));
                parameters.putAll(metadataSnapshot.parameters());
                return new TemplatePrefillResult(PREFILL_MODE_FORM, template.code(), parameters, rawContent, "已按平台模板元数据回填参数");
            } catch (NoSuchElementException ignored) {
            }
        }
        TemplatePrefillResult heuristicResult = parseByTemplateHeuristics(rawContent, safeContext);
        if (heuristicResult != null) {
            return heuristicResult;
        }
        return new TemplatePrefillResult(PREFILL_MODE_MANUAL, null, Map.of(), rawContent, "当前配置不是平台可逆模板，已回显仓库原文，可继续手动修改");
    }

    /**
     * 根据模板参数收集需要写入 Woodpecker repo secrets 的敏感值。
     * 手动 YAML 模式允许高级用户自行维护 secrets，因此只在提供了值时才同步。
     */
    public List<TemplateSecret> collectSecrets(String code,
                                               TemplateRenderContext context,
                                               Map<String, String> parameters,
                                               boolean requireValues) {
        TemplateRenderContext safeContext = normalizeContext(context);
        Map<String, String> normalizedParameters = normalizeParameters(parameters);
        String normalizedCode = requireTemplate(code).code();
        if (TEMPLATE_DOCKER_BUILDX.equals(normalizedCode)) {
            List<TemplateSecret> secrets = new ArrayList<>(collectDockerSecrets(safeContext, normalizedParameters, requireValues));
            if (isServerDeployEnabled(normalizedParameters)) {
                secrets.addAll(collectServerDeploySecrets(safeContext, normalizedParameters, requireValues));
            }
            return List.copyOf(secrets);
        }
        if (TEMPLATE_SSH_REMOTE.equals(normalizedCode)) {
            return collectSshSecrets(safeContext, normalizedParameters, requireValues);
        }
        if (supportsServerDeploy(normalizedCode) && isServerDeployEnabled(normalizedParameters)) {
            return collectServerDeploySecrets(safeContext, normalizedParameters, requireValues);
        }
        return List.of();
    }

    private AiClubPipelineConfigTemplateItem toItem(TemplateDefinition template, TemplateRenderContext context) {
        Map<String, String> previewDefaults = buildPreviewParameterValues(template, context);
        String contentPreview = template.renderer().render(new TemplateRenderInput(context, previewDefaults));
        return new AiClubPipelineConfigTemplateItem(
                template.code(),
                template.name(),
                template.description(),
                template.category(),
                DEFAULT_CONFIG_PATH,
                contentPreview,
                template.requirements(),
                true,
                true,
                "",
                template.requiresRegistry(),
                TEMPLATE_DOCKER_BUILDX.equals(template.code()) ? resolveDockerImageRepo(context, previewDefaults) : null,
                template.parameters().stream().map(parameter -> toParameterItem(parameter, context)).toList()
        );
    }

    private AiClubPipelineConfigTemplateParameterItem toParameterItem(ParameterDefinition parameter, TemplateRenderContext context) {
        return new AiClubPipelineConfigTemplateParameterItem(
                parameter.key(),
                parameter.label(),
                parameter.type(),
                parameter.required(),
                parameter.defaultValue(context),
                parameter.placeholder(),
                parameter.helpText(),
                parameter.options(),
                parameter.secret(),
                parameter.dependsOnKey(),
                parameter.dependsOnValue()
        );
    }

    private Map<String, String> buildDefaultParameterValues(TemplateDefinition template, TemplateRenderContext context) {
        Map<String, String> defaults = new LinkedHashMap<>();
        for (ParameterDefinition parameter : template.parameters()) {
            defaults.put(parameter.key(), parameter.defaultValue(context));
        }
        return defaults;
    }

    private Map<String, String> buildPreviewParameterValues(TemplateDefinition template, TemplateRenderContext context) {
        Map<String, String> previewValues = buildDefaultParameterValues(template, context);
        if (TEMPLATE_DOCKER_BUILDX.equals(template.code()) && !hasText(previewValues.get("registryUrl"))) {
            previewValues.put("registryUrl", "registry.example.com");
        }
        if (TEMPLATE_SSH_REMOTE.equals(template.code()) && !hasText(previewValues.get(PARAM_DIRECT_SSH_HOST))) {
            previewValues.put(PARAM_DIRECT_SSH_HOST, "deploy.example.com");
        }
        if (TEMPLATE_SSH_REMOTE.equals(template.code()) && !hasText(previewValues.get(PARAM_JUMP_SERVER_HOST))) {
            previewValues.put(PARAM_JUMP_SERVER_HOST, "jump.example.com");
        }
        if (TEMPLATE_SSH_REMOTE.equals(template.code()) && !hasText(previewValues.get(PARAM_JUMP_TARGET_ASSET_IP))) {
            previewValues.put(PARAM_JUMP_TARGET_ASSET_IP, "10.10.10.10");
        }
        return previewValues;
    }

    private void validateRequiredVisibleParameters(TemplateDefinition template,
                                                   TemplateRenderContext context,
                                                   Map<String, String> parameters) {
        for (ParameterDefinition parameter : template.parameters()) {
            if (!isParameterActive(template, parameter, parameters)) {
                continue;
            }
            if (parameter.secret()) {
                continue;
            }
            String value = param(context, parameters, parameter.key());
            if (parameter.required() && !hasText(value)) {
                throw new IllegalArgumentException(parameter.label() + "不能为空");
            }
        }
    }

    private List<TemplateSecret> collectDockerSecrets(TemplateRenderContext context,
                                                      Map<String, String> parameters,
                                                      boolean requireValues) {
        List<TemplateSecret> secrets = new ArrayList<>();
        appendSecret(
                secrets,
                secretName(context, "REGISTRY_USERNAME"),
                parameters.get("registryUsername"),
                "AI Club Pipeline Docker Buildx 模板推送账号。",
                List.of("push", "manual", "tag"),
                List.of("woodpeckerci/plugin-docker-buildx", "woodpeckerci/plugin-docker-buildx:2"),
                requireValues,
                "推送账号不能为空"
        );
        appendSecret(
                secrets,
                secretName(context, "REGISTRY_PASSWORD"),
                parameters.get("registryPassword"),
                "AI Club Pipeline Docker Buildx 模板推送密码。",
                List.of("push", "manual", "tag"),
                List.of("woodpeckerci/plugin-docker-buildx", "woodpeckerci/plugin-docker-buildx:2"),
                requireValues,
                "推送密码 / Token 不能为空"
        );
        return List.copyOf(secrets);
    }

    private List<TemplateSecret> collectSshSecrets(TemplateRenderContext context,
                                                   Map<String, String> parameters,
                                                   boolean requireValues) {
        List<TemplateSecret> secrets = new ArrayList<>();
        String connectionType = resolveConnectionType(parameters.get(PARAM_CONNECTION_TYPE));
        appendSecret(
                secrets,
                secretName(context, "SSH_PRIVATE_KEY"),
                CONNECTION_JUMPSERVER.equals(connectionType)
                        ? parameters.get(PARAM_JUMP_SERVER_PRIVATE_KEY)
                        : parameters.get(PARAM_DIRECT_SSH_PRIVATE_KEY),
                CONNECTION_JUMPSERVER.equals(connectionType)
                        ? "AI Club Pipeline JumpServer 远程部署私钥。"
                        : "AI Club Pipeline SSH 远程部署私钥。",
                List.of("push", "manual"),
                List.of(),
                requireValues,
                CONNECTION_JUMPSERVER.equals(connectionType) ? "JumpServer 私钥不能为空" : "SSH 私钥不能为空"
        );
        return List.copyOf(secrets);
    }

    private List<TemplateSecret> collectServerDeploySecrets(TemplateRenderContext context,
                                                            Map<String, String> parameters,
                                                            boolean requireValues) {
        List<TemplateSecret> secrets = new ArrayList<>();
        String connectionType = resolveConnectionType(parameters.get(PARAM_SERVER_DEPLOY_CONNECTION_TYPE));
        appendSecret(
                secrets,
                secretName(context, "SERVER_DEPLOY_SSH_PRIVATE_KEY"),
                CONNECTION_JUMPSERVER.equals(connectionType)
                        ? parameters.get(PARAM_SERVER_DEPLOY_JUMP_PRIVATE_KEY)
                        : parameters.get(PARAM_SERVER_DEPLOY_DIRECT_PRIVATE_KEY),
                CONNECTION_JUMPSERVER.equals(connectionType)
                        ? "AI Club Pipeline 后置 JumpServer 部署私钥。"
                        : "AI Club Pipeline 后置服务器部署私钥。",
                List.of("push", "manual", "tag"),
                List.of(),
                requireValues,
                CONNECTION_JUMPSERVER.equals(connectionType) ? "部署 JumpServer 私钥不能为空" : "部署 SSH 私钥不能为空"
        );
        return List.copyOf(secrets);
    }

    private void appendSecret(List<TemplateSecret> secrets,
                              String name,
                              String value,
                              String note,
                              List<String> events,
                              List<String> images,
                              boolean requireValue,
                              String missingMessage) {
        if (!hasText(value)) {
            if (requireValue) {
                throw new IllegalArgumentException(missingMessage);
            }
            return;
        }
        secrets.add(new TemplateSecret(name, value.trim(), note, events, images));
    }

    private TemplateDefinition requireTemplate(String code) {
        String normalized = defaultString(code, "").toUpperCase(Locale.ROOT);
        return templates.stream()
                .filter(template -> template.code().equals(normalized))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("流水线配置模板不存在: " + code));
    }

    private TemplateRenderContext normalizeContext(TemplateRenderContext context) {
        TemplateRenderContext safeContext = context == null ? TemplateRenderContext.defaultPreview() : context;
        return new TemplateRenderContext(
                safeContext.pipelineId(),
                defaultString(safeContext.pipelineName(), DEFAULT_PIPELINE_NAME),
                defaultString(safeContext.branch(), DEFAULT_BRANCH),
                defaultString(safeContext.gitlabProjectPath(), DEFAULT_GITLAB_PROJECT_PATH)
        );
    }

    private String renderJavaMaven(TemplateRenderInput input) {
        String image = requiredParam(input, "javaImage");
        String branch = requiredParam(input, "branch");
        List<String> testCommands = new ArrayList<>();
        appendProjectRootCommand(testCommands, input);
        testCommands.addAll(splitNonBlankLines(param(input, "testCommand")));
        List<String> packageCommands = new ArrayList<>();
        appendProjectRootCommand(packageCommands, input);
        packageCommands.addAll(splitNonBlankLines(param(input, "packageCommand")));
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: test
                    image: %s
                    commands:
                %s

                  - name: package
                    image: %s
                    commands:
                %s
                    when:
                      - event: [push, manual]
                        branch: %s
                """.formatted(
                yamlQuote(image),
                renderCommandEntries(testCommands),
                yamlQuote(image),
                renderCommandEntries(packageCommands),
                yamlQuote(branch)
        ).stripTrailing()).append('\n');
        appendServerDeployStep(builder, input);
        return builder.toString();
    }

    private String renderNodeVite(TemplateRenderInput input) {
        List<String> commands = new ArrayList<>();
        appendProjectRootCommand(commands, input);
        commands.addAll(splitNonBlankLines(param(input, "installCommand")));
        commands.addAll(splitNonBlankLines(param(input, "buildCommand")));
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: build
                    image: %s
                    commands:
                %s
                    when:
                      - event: [push, pull_request, manual]
                        branch: %s
                """.formatted(
                yamlQuote(requiredParam(input, "nodeImage")),
                renderCommandEntries(commands),
                yamlQuote(requiredParam(input, "branch"))
        ).stripTrailing()).append('\n');
        appendServerDeployStep(builder, input);
        return builder.toString();
    }

    private String renderPythonFastapi(TemplateRenderInput input) {
        List<String> commands = new ArrayList<>();
        appendProjectRootCommand(commands, input);
        commands.addAll(splitNonBlankLines(param(input, "installCommand")));
        commands.addAll(splitNonBlankLines(param(input, "verifyCommand")));
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: verify
                    image: %s
                    commands:
                %s
                    when:
                      - event: [push, pull_request, manual]
                        branch: %s
                """.formatted(
                yamlQuote(requiredParam(input, "pythonImage")),
                renderCommandEntries(commands),
                yamlQuote(requiredParam(input, "branch"))
        ).stripTrailing()).append('\n');
        appendServerDeployStep(builder, input);
        return builder.toString();
    }

    private String renderDockerBuildx(TemplateRenderInput input) {
        String insecureSetting = Boolean.parseBoolean(defaultString(param(input, "registryInsecure"), "false"))
                ? "      insecure: true\n"
                : "";
        String projectRoot = normalizedProjectRoot(input);
        String contextPath = hasText(projectRoot) ? projectRoot : ".";
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: docker-build-push
                    image: woodpeckerci/plugin-docker-buildx:2
                    privileged: true
                    settings:
                      context: %s
                      dockerfile: %s
                      registry: %s
                      repo: %s
                      username:
                        from_secret: %s
                      password:
                        from_secret: %s
                      tags:
                %s%s    when:
                      - event: [push, manual]
                        branch: %s
                      - event: tag
                """.formatted(
                yamlQuote(contextPath),
                yamlQuote(requiredParam(input, "dockerfile")),
                yamlQuote(normalizeRegistryHost(requiredParam(input, "registryUrl"))),
                yamlQuote(resolveDockerImageRepo(input.context(), input.parameters())),
                secretName(input.context(), "REGISTRY_USERNAME"),
                secretName(input.context(), "REGISTRY_PASSWORD"),
                renderTags(requiredParam(input, "tags")),
                insecureSetting,
                yamlQuote(requiredParam(input, "branch"))
        ).stripTrailing()).append('\n');
        appendServerDeployStep(builder, input);
        return builder.toString();
    }

    private String renderSshRemote(TemplateRenderInput input) {
        RemoteConnectionSpec connection = resolveSshRemoteConnection(input);
        List<String> commands = List.of(
                "apk add --no-cache openssh-client",
                "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
                "printf '%s\\n' \"$SSH_PRIVATE_KEY\" > ~/.ssh/id_ai_club && chmod 600 ~/.ssh/id_ai_club",
                "ssh-keyscan -p " + connection.port() + " " + shellSingleQuote(connection.host()) + " >> ~/.ssh/known_hosts",
                buildRemoteScriptCommand(connection.port(), connection.remoteTarget(), defaultString(param(input, "sshCommands"), "pwd"))
        );
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: ssh-deploy
                    image: alpine:3.20
                    environment:
                      SSH_PRIVATE_KEY:
                        from_secret: %s
                    commands:
                %s
                    when:
                      - event: [push, manual]
                        branch: %s
                """.formatted(
                secretName(input.context(), "SSH_PRIVATE_KEY"),
                renderCommandEntries(commands),
                yamlQuote(requiredParam(input, "branch"))
        ).stripTrailing()).append('\n');
        return builder.toString();
    }

    private String renderGenericShell(TemplateRenderInput input) {
        List<String> commands = new ArrayList<>();
        appendProjectRootCommand(commands, input);
        commands.addAll(splitNonBlankLines(param(input, "shellCommands")));
        StringBuilder builder = startPipelineYaml(input);
        builder.append("""
                steps:
                  - name: verify
                    image: %s
                    commands:
                %s
                    when:
                      - event: [push, pull_request, manual]
                        branch: %s
                """.formatted(
                yamlQuote(requiredParam(input, "shellImage")),
                renderCommandEntries(commands),
                yamlQuote(requiredParam(input, "branch"))
        ).stripTrailing()).append('\n');
        appendServerDeployStep(builder, input);
        return builder.toString();
    }

    /**
     * skip_clone 是 Woodpecker 的顶层开关，不属于具体 step。
     * 这里统一在所有模板渲染前拼接，避免每个模板各自维护重复前缀。
     */
    private StringBuilder startPipelineYaml(TemplateRenderInput input) {
        StringBuilder builder = new StringBuilder();
        if (Boolean.parseBoolean(defaultString(param(input, PARAM_SKIP_CLONE), "false"))) {
            builder.append("skip_clone: true\n\n");
        }
        return builder;
    }

    private String prependTemplateMetadata(TemplateDefinition template,
                                           Map<String, String> parameters,
                                           String renderedContent) {
        if (!hasText(renderedContent) || template == null) {
            return defaultString(renderedContent);
        }
        StringBuilder builder = new StringBuilder();
        builder.append(METADATA_TEMPLATE_PREFIX).append(template.code()).append('\n');
        builder.append(METADATA_VERSION_PREFIX).append(METADATA_VERSION).append('\n');
        for (ParameterDefinition parameter : template.parameters()) {
            if (parameter.secret()) {
                continue;
            }
            String value = parameters.get(parameter.key());
            if (!shouldPersistMetadataValue(parameter, value)) {
                continue;
            }
            builder.append(METADATA_PARAMETER_PREFIX)
                    .append(parameter.key())
                    .append('=')
                    .append(Base64.getEncoder().encodeToString(defaultString(value).getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                    .append('\n');
        }
        builder.append('\n');
        return builder + defaultString(renderedContent).replace("\r\n", "\n").replace('\r', '\n');
    }

    private boolean shouldPersistMetadataValue(ParameterDefinition parameter, String value) {
        if (parameter == null) {
            return false;
        }
        if (TYPE_SWITCH.equals(parameter.type()) || TYPE_SELECT.equals(parameter.type())) {
            return value != null;
        }
        return hasText(value);
    }

    private String resolveDockerImageRepo(TemplateRenderContext context, Map<String, String> parameters) {
        String configuredRepo = trimToNull(parameters.get("imageRepo"));
        if (configuredRepo != null) {
            return normalizeRepositoryPath(configuredRepo);
        }
        return normalizeRegistryHost(parameters.getOrDefault("registryUrl", "registry.example.com"))
                + "/" + normalizeProjectPath(context.gitlabProjectPath());
    }

    private String renderCommandLines(String commands) {
        List<String> lines = splitNonBlankLines(commands);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("模板命令不能为空");
        }
        return renderCommandEntries(lines);
    }

    private String renderCommandEntries(List<String> commands) {
        if (commands == null || commands.isEmpty()) {
            throw new IllegalArgumentException("模板命令不能为空");
        }
        StringBuilder builder = new StringBuilder();
        for (String command : commands) {
            if (command == null) {
                continue;
            }
            String normalized = command.replace("\r\n", "\n").replace('\r', '\n').stripTrailing();
            if (!hasText(normalized)) {
                continue;
            }
            if (normalized.contains("\n")) {
                builder.append("      - |\n");
                builder.append(indentBlock(normalized, 8));
            } else {
                builder.append("      - ").append(yamlQuote(normalized)).append('\n');
            }
        }
        return builder.toString();
    }

    private String renderTags(String tags) {
        List<String> lines = splitNonBlankLines(tags);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("镜像 Tag 不能为空");
        }
        StringBuilder builder = new StringBuilder();
        for (String line : lines) {
            builder.append("        - ").append(yamlPlainOrQuote(line)).append('\n');
        }
        return builder.toString();
    }

    private List<String> splitNonBlankLines(String value) {
        List<String> lines = new ArrayList<>();
        for (String line : defaultString(value).replace("\r\n", "\n").replace('\r', '\n').split("\n")) {
            String normalized = line.trim();
            if (hasText(normalized)) {
                lines.add(normalized);
            }
        }
        return lines;
    }

    private String indentBlock(String value, int spaces) {
        String prefix = " ".repeat(spaces);
        StringBuilder builder = new StringBuilder();
        for (String line : defaultString(value).replace("\r\n", "\n").replace('\r', '\n').split("\n")) {
            builder.append(prefix).append(line).append('\n');
        }
        return builder.toString();
    }

    private void appendServerDeployStep(StringBuilder builder, TemplateRenderInput input) {
        if (!isServerDeployEnabled(input.parameters())) {
            return;
        }
        RemoteConnectionSpec connection = resolveServerDeployConnection(input);
        String deployCommands = requiredParam(input, PARAM_SERVER_DEPLOY_COMMANDS);
        String sourcePath = resolveProjectRelativePath(normalizedProjectRoot(input), trimToNull(param(input, PARAM_SERVER_DEPLOY_SOURCE_PATH)));
        String remotePath = trimToNull(param(input, PARAM_SERVER_DEPLOY_REMOTE_PATH));
        if (sourcePath != null && remotePath == null) {
            throw new IllegalArgumentException("启用服务器部署并上传产物时，服务器目标路径不能为空");
        }

        List<String> commands = new ArrayList<>();
        commands.add("apk add --no-cache openssh-client bash");
        commands.add("mkdir -p ~/.ssh && chmod 700 ~/.ssh");
        commands.add("printf '%s\\n' \"$SSH_PRIVATE_KEY\" > ~/.ssh/id_ai_club && chmod 600 ~/.ssh/id_ai_club");
        commands.add("ssh-keyscan -p " + connection.port() + " " + shellSingleQuote(connection.host()) + " >> ~/.ssh/known_hosts");
        if (sourcePath != null) {
            commands.add(buildRemoteScriptCommand(connection.port(), connection.remoteTarget(), buildRemotePrepareScript(remotePath)));
            commands.add("DEPLOY_SOURCE=" + shellSingleQuote(sourcePath));
            commands.add("set -- $DEPLOY_SOURCE");
            commands.add("if [ \"$1\" = \"$DEPLOY_SOURCE\" ] && [ ! -e \"$DEPLOY_SOURCE\" ]; then echo \"未找到部署产物: $DEPLOY_SOURCE\" >&2; exit 1; fi");
            commands.add("if [ \"$#\" -ne 1 ]; then echo \"部署产物路径匹配到多个条目，请调整部署产物路径\" >&2; printf '%s\\n' \"$@\"; exit 1; fi");
            commands.add("deploy_source=\"$1\"");
            commands.add("if [ -d \"$deploy_source\" ]; then scp -r -i ~/.ssh/id_ai_club -P " + connection.port() + " \"$deploy_source\" " + shellSingleQuote(connection.remoteTarget() + ":" + remotePath)
                    + "; else scp -i ~/.ssh/id_ai_club -P " + connection.port() + " \"$deploy_source\" " + shellSingleQuote(connection.remoteTarget() + ":" + remotePath) + "; fi");
        }
        commands.add(buildRemoteScriptCommand(connection.port(), connection.remoteTarget(), buildRemoteDeployScript(remotePath, deployCommands)));

        builder.append('\n');
        builder.append("""
                  - name: deploy
                    image: alpine:3.20
                    environment:
                      SSH_PRIVATE_KEY:
                        from_secret: %s
                    commands:
                %s
                    when:
                      - event: [push, manual]
                        branch: %s
                """.formatted(
                secretName(input.context(), "SERVER_DEPLOY_SSH_PRIVATE_KEY"),
                renderCommandEntries(commands),
                yamlQuote(requiredParam(input, "branch"))
        ));
    }

    private String buildRemotePrepareScript(String remotePath) {
        StringBuilder builder = new StringBuilder("set -eu\n");
        builder.append("remote_path=").append(shellSingleQuote(remotePath)).append('\n');
        builder.append("mkdir -p \"$(dirname \"$remote_path\")\"\n");
        return builder.toString();
    }

    private String buildRemoteDeployScript(String remotePath, String deployCommands) {
        StringBuilder builder = new StringBuilder("set -eu\n");
        for (String line : splitNonBlankLines(deployCommands)) {
            builder.append(line).append('\n');
        }
        return builder.toString();
    }

    private String buildRemoteScriptCommand(String sshPort, String remoteTarget, String remoteScript) {
        StringBuilder builder = new StringBuilder();
        builder.append("ssh -i ~/.ssh/id_ai_club -p ").append(sshPort).append(' ')
                .append(shellSingleQuote(remoteTarget))
                .append(" 'bash -se' <<'AI_CLUB_REMOTE_SCRIPT'\n");
        builder.append(defaultString(remoteScript).replace("\r\n", "\n").replace('\r', '\n').stripTrailing()).append('\n');
        builder.append("AI_CLUB_REMOTE_SCRIPT");
        return builder.toString();
    }

    private void appendProjectRootCommand(List<String> commands, TemplateRenderInput input) {
        String projectRoot = normalizedProjectRoot(input);
        if (!hasText(projectRoot)) {
            return;
        }
        commands.add("cd " + shellSingleQuote(projectRoot));
    }

    private boolean supportsServerDeploy(String templateCode) {
        return !"SSH_REMOTE".equals(templateCode);
    }

    private boolean isServerDeployEnabled(Map<String, String> parameters) {
        return Boolean.parseBoolean(defaultString(parameters.get(PARAM_SERVER_DEPLOY_ENABLED), "false"));
    }

    /**
     * 统一把直连服务器和 JumpServer 两种表单参数收敛成远端连接信息，
     * 让 SSH_REMOTE 模板与后置部署步骤复用同一套拼装逻辑。
     */
    private RemoteConnectionSpec resolveSshRemoteConnection(TemplateRenderInput input) {
        String connectionType = resolveConnectionType(param(input, PARAM_CONNECTION_TYPE));
        if (CONNECTION_JUMPSERVER.equals(connectionType)) {
            String host = requiredParam(input, PARAM_JUMP_SERVER_HOST);
            String port = requireNumericPort(requiredParam(input, PARAM_JUMP_SERVER_PORT), "JumpServer 端口必须为数字");
            String jumpUser = requiredParam(input, PARAM_JUMP_SERVER_USER);
            String targetUser = requiredParam(input, PARAM_JUMP_TARGET_USER);
            String targetAssetIp = requiredParam(input, PARAM_JUMP_TARGET_ASSET_IP);
            return new RemoteConnectionSpec(connectionType, host, port, buildJumpServerRemoteTarget(jumpUser, targetUser, targetAssetIp, host));
        }
        String host = requiredParam(input, PARAM_DIRECT_SSH_HOST);
        String port = requireNumericPort(requiredParam(input, PARAM_DIRECT_SSH_PORT), "SSH 端口必须为数字");
        String user = requiredParam(input, PARAM_DIRECT_SSH_USER);
        return new RemoteConnectionSpec(connectionType, host, port, user + "@" + host);
    }

    /**
     * 后置部署与 SSH_REMOTE 模板共用相同的连接方式语义，
     * 这里把上传产物和执行远程脚本需要的 host/port/target 统一解析出来。
     */
    private RemoteConnectionSpec resolveServerDeployConnection(TemplateRenderInput input) {
        String connectionType = resolveConnectionType(param(input, PARAM_SERVER_DEPLOY_CONNECTION_TYPE));
        if (CONNECTION_JUMPSERVER.equals(connectionType)) {
            String host = requiredParam(input, PARAM_SERVER_DEPLOY_JUMP_HOST);
            String port = requireNumericPort(requiredParam(input, PARAM_SERVER_DEPLOY_JUMP_PORT), "部署 JumpServer 端口必须为数字");
            String jumpUser = requiredParam(input, PARAM_SERVER_DEPLOY_JUMP_USER);
            String targetUser = requiredParam(input, PARAM_SERVER_DEPLOY_JUMP_TARGET_USER);
            String targetAssetIp = requiredParam(input, PARAM_SERVER_DEPLOY_JUMP_TARGET_ASSET_IP);
            return new RemoteConnectionSpec(connectionType, host, port, buildJumpServerRemoteTarget(jumpUser, targetUser, targetAssetIp, host));
        }
        String host = requiredParam(input, PARAM_SERVER_DEPLOY_DIRECT_HOST);
        String port = requireNumericPort(requiredParam(input, PARAM_SERVER_DEPLOY_DIRECT_PORT), "部署 SSH 端口必须为数字");
        String user = requiredParam(input, PARAM_SERVER_DEPLOY_DIRECT_USER);
        return new RemoteConnectionSpec(connectionType, host, port, user + "@" + host);
    }

    private String resolveConnectionType(String value) {
        String normalized = defaultString(value, CONNECTION_DIRECT_SSH).trim().toUpperCase(Locale.ROOT);
        if (CONNECTION_DIRECT_SSH.equals(normalized) || CONNECTION_JUMPSERVER.equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("连接方式不支持: " + normalized);
    }

    private String requireNumericPort(String port, String errorMessage) {
        if (!port.matches("\\d+")) {
            throw new IllegalArgumentException(errorMessage);
        }
        return port;
    }

    private String buildJumpServerRemoteTarget(String jumpUser, String targetUser, String targetAssetIp, String jumpHost) {
        return jumpUser + "@" + targetUser + "@" + targetAssetIp + "@" + jumpHost;
    }

    private boolean isParameterActive(TemplateDefinition template,
                                      ParameterDefinition parameter,
                                      Map<String, String> parameters) {
        if (parameter.dependsOnKey() == null) {
            return true;
        }
        ParameterDefinition controller = template.parameters().stream()
                .filter(item -> item.key().equals(parameter.dependsOnKey()))
                .findFirst()
                .orElse(null);
        if (controller != null && !isParameterActive(template, controller, parameters)) {
            return false;
        }
        String actualValue = defaultString(parameters.get(parameter.dependsOnKey()), "");
        return parameter.dependsOnValue().equalsIgnoreCase(actualValue);
    }

    private String param(TemplateRenderInput input, String key) {
        return param(input.context(), input.parameters(), key);
    }

    private String requiredParam(TemplateRenderInput input, String key) {
        String value = param(input, key);
        if (!hasText(value)) {
            throw new IllegalArgumentException(key + "不能为空");
        }
        return value.trim();
    }

    private String param(TemplateRenderContext context, Map<String, String> parameters, String key) {
        String value = parameters.get(key);
        if (hasText(value)) {
            return value.trim();
        }
        return requireTemplateContainingParameter(key).parameters().stream()
                .filter(parameter -> parameter.key().equals(key))
                .findFirst()
                .map(parameter -> parameter.defaultValue(context))
                .orElse("");
    }

    private String normalizedProjectRoot(TemplateRenderInput input) {
        return normalizeProjectRootPath(trimToNull(param(input, PARAM_PROJECT_ROOT)));
    }

    private TemplateDefinition requireTemplateContainingParameter(String key) {
        return templates.stream()
                .filter(template -> template.parameters().stream().anyMatch(parameter -> parameter.key().equals(key)))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("模板参数不存在: " + key));
    }

    private String secretName(TemplateRenderContext context, String suffix) {
        if (context.pipelineId() != null && context.pipelineId() > 0L) {
            return "AI_CLUB_PIPELINE_" + context.pipelineId() + "_" + suffix;
        }
        return "AI_CLUB_PIPELINE_" + suffix;
    }

    private Map<String, String> normalizeParameters(Map<String, String> parameters) {
        if (parameters == null || parameters.isEmpty()) {
            return Map.of();
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        parameters.forEach((key, value) -> {
            if (key != null) {
                normalized.put(key.trim(), value == null ? "" : value.trim());
            }
        });
        return normalized;
    }

    private String normalizeProjectPath(String gitlabProjectPath) {
        String normalized = defaultString(gitlabProjectPath, DEFAULT_GITLAB_PROJECT_PATH)
                .replace('\\', '/')
                .toLowerCase(Locale.ROOT);
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        List<String> parts = new ArrayList<>();
        for (String part : normalized.split("/")) {
            String safePart = normalizeRepositorySegment(part);
            if (hasText(safePart)) {
                parts.add(safePart);
            }
        }
        return parts.isEmpty() ? "repo" : String.join("/", parts);
    }

    private String normalizeProjectRootPath(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "";
        }
        normalized = normalized.replace('\\', '/');
        while (normalized.startsWith("./")) {
            normalized = normalized.substring(2);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (!hasText(normalized)) {
            return "";
        }
        if (normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("项目根目录只能填写仓库内相对路径");
        }
        for (String part : normalized.split("/")) {
            String trimmed = part.trim();
            if (!hasText(trimmed) || ".".equals(trimmed) || "..".equals(trimmed)) {
                throw new IllegalArgumentException("项目根目录不能包含 . 或 ..");
            }
        }
        return normalized;
    }

    private String resolveProjectRelativePath(String projectRoot, String path) {
        if (!hasText(path)) {
            return null;
        }
        String normalizedPath = path.replace('\\', '/').trim();
        if (!hasText(projectRoot)) {
            return normalizedPath;
        }
        if (normalizedPath.startsWith(projectRoot + "/")) {
            return normalizedPath;
        }
        if (normalizedPath.startsWith("/") || normalizedPath.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("部署产物路径只能填写仓库内相对路径");
        }
        return projectRoot + "/" + normalizedPath;
    }

    private String normalizeRepositoryPath(String value) {
        String normalized = defaultString(value).replace('\\', '/').toLowerCase(Locale.ROOT);
        List<String> parts = new ArrayList<>();
        for (String part : normalized.split("/")) {
            String safePart = normalizeRepositorySegment(part);
            if (hasText(safePart)) {
                parts.add(safePart);
            }
        }
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("镜像仓库名不能为空");
        }
        return String.join("/", parts);
    }

    private String normalizeRepositorySegment(String value) {
        String normalized = defaultString(value)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9._-]+", "-")
                .replaceAll("-{2,}", "-");
        while (normalized.startsWith("-") || normalized.startsWith(".")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("-") || normalized.endsWith(".")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String normalizeRegistryHost(String registryUrl) {
        String normalized = defaultString(registryUrl);
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.contains("://")) {
            URI uri = URI.create(normalized);
            String host = uri.getHost();
            if (!hasText(host)) {
                throw new IllegalArgumentException("推送服务器地址格式不正确");
            }
            return uri.getPort() > 0 ? host + ":" + uri.getPort() : host;
        }
        int slashIndex = normalized.indexOf('/');
        return slashIndex >= 0 ? normalized.substring(0, slashIndex) : normalized;
    }

    private MetadataSnapshot extractMetadata(String rawContent) {
        String templateCode = null;
        Map<String, String> parameters = new LinkedHashMap<>();
        for (String line : normalizeLines(rawContent)) {
            if (line.startsWith(METADATA_TEMPLATE_PREFIX)) {
                templateCode = line.substring(METADATA_TEMPLATE_PREFIX.length()).trim().toUpperCase(Locale.ROOT);
                continue;
            }
            if (!line.startsWith(METADATA_PARAMETER_PREFIX)) {
                continue;
            }
            String payload = line.substring(METADATA_PARAMETER_PREFIX.length()).trim();
            int equalsIndex = payload.indexOf('=');
            if (equalsIndex <= 0) {
                continue;
            }
            String key = payload.substring(0, equalsIndex).trim();
            String encodedValue = payload.substring(equalsIndex + 1).trim();
            if (!hasText(key) || !hasText(encodedValue)) {
                continue;
            }
            try {
                parameters.put(key, new String(Base64.getDecoder().decode(encodedValue), java.nio.charset.StandardCharsets.UTF_8));
            } catch (IllegalArgumentException ignored) {
            }
        }
        return new MetadataSnapshot(templateCode, parameters);
    }

    private TemplatePrefillResult parseByTemplateHeuristics(String rawContent, TemplateRenderContext context) {
        if (!hasText(rawContent)) {
            return null;
        }
        if (rawContent.contains("name: ssh-deploy")) {
            return buildHeuristicPrefill(TEMPLATE_SSH_REMOTE, parseSshRemoteParameters(rawContent), rawContent, context, "已按 SSH 远程部署模板回填可识别参数");
        }
        if (rawContent.contains("name: test") && rawContent.contains("name: package")) {
            return buildHeuristicPrefill("JAVA_MAVEN", parseJavaMavenParameters(rawContent), rawContent, context, "已按 Java / Maven 模板回填可识别参数");
        }
        if (rawContent.contains("name: build")) {
            return buildHeuristicPrefill("NODE_VITE", parseNodeViteParameters(rawContent), rawContent, context, "已按 Node / Vite 模板回填可识别参数");
        }
        if (rawContent.contains("name: verify") && rawContent.contains("python")) {
            return buildHeuristicPrefill("PYTHON_FASTAPI", parsePythonFastapiParameters(rawContent), rawContent, context, "已按 Python / FastAPI 模板回填可识别参数");
        }
        if (rawContent.contains("name: verify")) {
            return buildHeuristicPrefill("GENERIC_SHELL", parseGenericShellParameters(rawContent), rawContent, context, "已按通用 Shell 模板回填可识别参数");
        }
        return null;
    }

    private TemplatePrefillResult buildHeuristicPrefill(String templateCode,
                                                        Map<String, String> parsedParameters,
                                                        String rawContent,
                                                        TemplateRenderContext context,
                                                        String message) {
        if (parsedParameters == null || parsedParameters.isEmpty()) {
            return null;
        }
        TemplateDefinition template = requireTemplate(templateCode);
        Map<String, String> parameters = new LinkedHashMap<>(buildDefaultParameterValues(template, context));
        parameters.putAll(parsedParameters);
        return new TemplatePrefillResult(PREFILL_MODE_FORM, template.code(), parameters, rawContent, message);
    }

    private Map<String, String> parseSshRemoteParameters(String rawContent) {
        Map<String, String> parameters = new LinkedHashMap<>();
        appendSkipClone(rawContent, parameters);
        putIfPresent(parameters, "branch", firstYamlValue(rawContent, "branch:"));
        putIfPresent(parameters, "sshCommands", firstRemoteScriptBlock(rawContent));
        String remoteTarget = firstSshRemoteTarget(rawContent);
        String host = firstSshHost(rawContent);
        String port = firstSshPort(rawContent);
        if (remoteTarget != null && remoteTarget.split("@").length >= 4) {
            String[] parts = remoteTarget.split("@", 4);
            parameters.put(PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER);
            putIfPresent(parameters, PARAM_JUMP_SERVER_USER, parts[0]);
            putIfPresent(parameters, PARAM_JUMP_TARGET_USER, parts[1]);
            putIfPresent(parameters, PARAM_JUMP_TARGET_ASSET_IP, parts[2]);
            putIfPresent(parameters, PARAM_JUMP_SERVER_HOST, parts[3]);
            putIfPresent(parameters, PARAM_JUMP_SERVER_PORT, port);
        } else {
            parameters.put(PARAM_CONNECTION_TYPE, CONNECTION_DIRECT_SSH);
            putIfPresent(parameters, PARAM_DIRECT_SSH_HOST, host);
            putIfPresent(parameters, PARAM_DIRECT_SSH_PORT, port);
            putIfPresent(parameters, PARAM_DIRECT_SSH_USER, extractDirectUser(remoteTarget));
        }
        return parameters;
    }

    private Map<String, String> parseJavaMavenParameters(String rawContent) {
        Map<String, String> parameters = new LinkedHashMap<>();
        appendSkipClone(rawContent, parameters);
        putIfPresent(parameters, "branch", firstYamlValue(rawContent, "branch:"));
        putIfPresent(parameters, "javaImage", firstImageForStep(rawContent, "test"));
        putIfPresent(parameters, "projectRoot", firstStepProjectRoot(rawContent, "test"));
        putIfPresent(parameters, "testCommand", String.join("\n", commandsWithoutLeadingCd(stepCommands(rawContent, "test"))));
        putIfPresent(parameters, "packageCommand", String.join("\n", commandsWithoutLeadingCd(stepCommands(rawContent, "package"))));
        appendParsedServerDeploy(rawContent, parameters);
        return parameters;
    }

    private Map<String, String> parseNodeViteParameters(String rawContent) {
        Map<String, String> parameters = new LinkedHashMap<>();
        appendSkipClone(rawContent, parameters);
        putIfPresent(parameters, "branch", firstYamlValue(rawContent, "branch:"));
        putIfPresent(parameters, "nodeImage", firstImageForStep(rawContent, "build"));
        putIfPresent(parameters, "projectRoot", firstStepProjectRoot(rawContent, "build"));
        List<String> commands = commandsWithoutLeadingCd(stepCommands(rawContent, "build"));
        if (!commands.isEmpty()) {
            putIfPresent(parameters, "installCommand", commands.get(0));
            if (commands.size() > 1) {
                putIfPresent(parameters, "buildCommand", String.join("\n", commands.subList(1, commands.size())));
            }
        }
        appendParsedServerDeploy(rawContent, parameters);
        return parameters;
    }

    private Map<String, String> parsePythonFastapiParameters(String rawContent) {
        Map<String, String> parameters = new LinkedHashMap<>();
        appendSkipClone(rawContent, parameters);
        putIfPresent(parameters, "branch", firstYamlValue(rawContent, "branch:"));
        putIfPresent(parameters, "pythonImage", firstImageForStep(rawContent, "verify"));
        putIfPresent(parameters, "projectRoot", firstStepProjectRoot(rawContent, "verify"));
        List<String> commands = commandsWithoutLeadingCd(stepCommands(rawContent, "verify"));
        if (!commands.isEmpty()) {
            putIfPresent(parameters, "installCommand", commands.get(0));
            if (commands.size() > 1) {
                putIfPresent(parameters, "verifyCommand", String.join("\n", commands.subList(1, commands.size())));
            }
        }
        appendParsedServerDeploy(rawContent, parameters);
        return parameters;
    }

    private Map<String, String> parseGenericShellParameters(String rawContent) {
        Map<String, String> parameters = new LinkedHashMap<>();
        appendSkipClone(rawContent, parameters);
        putIfPresent(parameters, "branch", firstYamlValue(rawContent, "branch:"));
        putIfPresent(parameters, "shellImage", firstImageForStep(rawContent, "verify"));
        putIfPresent(parameters, "projectRoot", firstStepProjectRoot(rawContent, "verify"));
        putIfPresent(parameters, "shellCommands", String.join("\n", commandsWithoutLeadingCd(stepCommands(rawContent, "verify"))));
        appendParsedServerDeploy(rawContent, parameters);
        return parameters;
    }

    private void appendParsedServerDeploy(String rawContent, Map<String, String> parameters) {
        if (!rawContent.contains("name: deploy")) {
            return;
        }
        parameters.put(PARAM_SERVER_DEPLOY_ENABLED, "true");
        String deployBlock = stepBlock(rawContent, "deploy");
        String remoteTarget = lastSshRemoteTarget(deployBlock);
        String port = firstSshPort(deployBlock);
        String sourcePath = extractValueAfterPrefix(deployBlock, "DEPLOY_SOURCE='", "'");
        String remotePath = extractRemotePathFromScp(deployBlock);
        String deployCommands = lastRemoteScriptBlock(deployBlock);
        if (remoteTarget != null && remoteTarget.split("@").length >= 4) {
            String[] parts = remoteTarget.split("@", 4);
            parameters.put(PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_JUMP_USER, parts[0]);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_JUMP_TARGET_USER, parts[1]);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_JUMP_TARGET_ASSET_IP, parts[2]);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_JUMP_HOST, parts[3]);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_JUMP_PORT, port);
        } else {
            parameters.put(PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_DIRECT_SSH);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_DIRECT_HOST, firstSshHost(deployBlock));
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_DIRECT_PORT, port);
            putIfPresent(parameters, PARAM_SERVER_DEPLOY_DIRECT_USER, extractDirectUser(remoteTarget));
        }
        putIfPresent(parameters, PARAM_SERVER_DEPLOY_SOURCE_PATH, sourcePath);
        putIfPresent(parameters, PARAM_SERVER_DEPLOY_REMOTE_PATH, remotePath);
        putIfPresent(parameters, PARAM_SERVER_DEPLOY_COMMANDS, deployCommands);
    }

    private void appendSkipClone(String rawContent, Map<String, String> parameters) {
        if (rawContent != null && rawContent.contains("skip_clone: true")) {
            parameters.put(PARAM_SKIP_CLONE, "true");
        }
    }

    private String firstYamlValue(String rawContent, String keyPrefix) {
        for (String line : normalizeLines(rawContent)) {
            String trimmed = line.trim();
            if (trimmed.startsWith(keyPrefix)) {
                return stripYamlQuotes(trimmed.substring(keyPrefix.length()).trim());
            }
        }
        return null;
    }

    private String firstImageForStep(String rawContent, String stepName) {
        return firstYamlValue(stepBlock(rawContent, stepName), "image:");
    }

    private String firstStepProjectRoot(String rawContent, String stepName) {
        List<String> commands = stepCommands(rawContent, stepName);
        if (!commands.isEmpty() && commands.get(0).startsWith("cd ")) {
            return stripShellQuotes(commands.get(0).substring(3).trim());
        }
        return "";
    }

    private List<String> stepCommands(String rawContent, String stepName) {
        String block = stepBlock(rawContent, stepName);
        List<String> commands = new ArrayList<>();
        boolean inCommands = false;
        boolean readingMultiline = false;
        StringBuilder multilineBuilder = new StringBuilder();
        for (String line : normalizeLines(block)) {
            if (line.trim().startsWith("commands:")) {
                inCommands = true;
                continue;
            }
            if (!inCommands) {
                continue;
            }
            if (line.startsWith("    when:") || line.startsWith("  - name:")) {
                if (readingMultiline) {
                    commands.add(multilineBuilder.toString().stripTrailing());
                }
                break;
            }
            if (readingMultiline) {
                if (line.startsWith("        ")) {
                    if (multilineBuilder.length() > 0) {
                        multilineBuilder.append('\n');
                    }
                    multilineBuilder.append(line.substring(8));
                    continue;
                }
                commands.add(multilineBuilder.toString().stripTrailing());
                multilineBuilder.setLength(0);
                readingMultiline = false;
            }
            String trimmed = line.trim();
            if (!trimmed.startsWith("-")) {
                continue;
            }
            if ("- |".equals(trimmed)) {
                readingMultiline = true;
                continue;
            }
            commands.add(stripYamlQuotes(trimmed.substring(1).trim()));
        }
        if (readingMultiline) {
            commands.add(multilineBuilder.toString().stripTrailing());
        }
        return commands;
    }

    private List<String> commandsWithoutLeadingCd(List<String> commands) {
        if (commands == null || commands.isEmpty()) {
            return List.of();
        }
        if (commands.get(0).startsWith("cd ")) {
            return List.copyOf(commands.subList(1, commands.size()));
        }
        return List.copyOf(commands);
    }

    private String stepBlock(String rawContent, String stepName) {
        StringBuilder builder = new StringBuilder();
        boolean collecting = false;
        for (String line : normalizeLines(rawContent)) {
            String trimmed = line.trim();
            if (!collecting) {
                if (trimmed.equals("- name: " + stepName)) {
                    collecting = true;
                    builder.append(line).append('\n');
                }
                continue;
            }
            if (trimmed.startsWith("- name: ") && !trimmed.equals("- name: " + stepName)) {
                break;
            }
            builder.append(line).append('\n');
        }
        return builder.toString();
    }

    private String firstSshHost(String rawContent) {
        for (String line : normalizeLines(rawContent)) {
            int keyscanIndex = line.indexOf("ssh-keyscan -p ");
            if (keyscanIndex < 0) {
                continue;
            }
            int quoteStart = line.indexOf('\'', keyscanIndex);
            int quoteEnd = quoteStart < 0 ? -1 : line.indexOf('\'', quoteStart + 1);
            if (quoteStart >= 0 && quoteEnd > quoteStart) {
                return line.substring(quoteStart + 1, quoteEnd);
            }
        }
        return null;
    }

    private String firstSshPort(String rawContent) {
        for (String line : normalizeLines(rawContent)) {
            int keyscanIndex = line.indexOf("ssh-keyscan -p ");
            if (keyscanIndex < 0) {
                continue;
            }
            int startIndex = keyscanIndex + "ssh-keyscan -p ".length();
            int endIndex = line.indexOf(' ', startIndex);
            if (endIndex > startIndex) {
                return line.substring(startIndex, endIndex).trim();
            }
        }
        return null;
    }

    private String firstSshRemoteTarget(String rawContent) {
        for (String line : normalizeLines(rawContent)) {
            String target = extractSshRemoteTarget(line);
            if (target != null) {
                return target;
            }
        }
        return null;
    }

    private String lastSshRemoteTarget(String rawContent) {
        String result = null;
        for (String line : normalizeLines(rawContent)) {
            String target = extractSshRemoteTarget(line);
            if (target != null) {
                result = target;
            }
        }
        return result;
    }

    private String extractSshRemoteTarget(String line) {
        int startIndex = line.indexOf("ssh -i ~/.ssh/id_ai_club -p ");
        if (startIndex < 0) {
            return null;
        }
        int firstQuote = line.indexOf('\'', startIndex);
        int secondQuote = firstQuote < 0 ? -1 : line.indexOf('\'', firstQuote + 1);
        if (firstQuote >= 0 && secondQuote > firstQuote) {
            return line.substring(firstQuote + 1, secondQuote);
        }
        return null;
    }

    private String firstRemoteScriptBlock(String rawContent) {
        List<String> blocks = remoteScriptBlocks(rawContent);
        return blocks.isEmpty() ? "" : blocks.get(0);
    }

    private String lastRemoteScriptBlock(String rawContent) {
        List<String> blocks = remoteScriptBlocks(rawContent);
        return blocks.isEmpty() ? "" : blocks.get(blocks.size() - 1);
    }

    private List<String> remoteScriptBlocks(String rawContent) {
        List<String> blocks = new ArrayList<>();
        String terminator = null;
        StringBuilder builder = null;
        for (String line : normalizeLines(rawContent)) {
            if (terminator == null) {
                int markerIndex = line.indexOf("<<'");
                if (markerIndex < 0) {
                    continue;
                }
                int startIndex = markerIndex + 3;
                int endIndex = line.indexOf('\'', startIndex);
                if (endIndex <= startIndex) {
                    continue;
                }
                terminator = line.substring(startIndex, endIndex);
                builder = new StringBuilder();
                continue;
            }
            if (line.trim().equals(terminator)) {
                if (builder != null) {
                    blocks.add(builder.toString().stripTrailing());
                }
                terminator = null;
                builder = null;
                continue;
            }
            if (builder != null) {
                if (builder.length() > 0) {
                    builder.append('\n');
                }
                builder.append(line);
            }
        }
        return blocks;
    }

    private String extractRemotePathFromScp(String rawContent) {
        for (String line : normalizeLines(rawContent)) {
            int colonIndex = line.indexOf(":/");
            if (line.contains("scp ") && colonIndex > 0) {
                int quoteStart = line.lastIndexOf('\'', colonIndex);
                int quoteEnd = line.indexOf('\'', colonIndex);
                if (quoteStart >= 0 && quoteEnd > colonIndex) {
                    return line.substring(colonIndex + 1, quoteEnd);
                }
            }
        }
        return null;
    }

    private String extractValueAfterPrefix(String rawContent, String prefix, String suffix) {
        for (String line : normalizeLines(rawContent)) {
            int startIndex = line.indexOf(prefix);
            if (startIndex < 0) {
                continue;
            }
            int valueStart = startIndex + prefix.length();
            int valueEnd = line.indexOf(suffix, valueStart);
            if (valueEnd > valueStart) {
                return line.substring(valueStart, valueEnd);
            }
        }
        return null;
    }

    private String extractDirectUser(String remoteTarget) {
        if (!hasText(remoteTarget) || !remoteTarget.contains("@")) {
            return null;
        }
        return remoteTarget.substring(0, remoteTarget.indexOf('@'));
    }

    private String stripYamlQuotes(String value) {
        String normalized = defaultString(value);
        if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
            normalized = normalized.substring(1, normalized.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        return normalized;
    }

    private String stripShellQuotes(String value) {
        String normalized = defaultString(value);
        if (normalized.length() >= 2 && normalized.startsWith("'") && normalized.endsWith("'")) {
            return normalized.substring(1, normalized.length() - 1).replace("'\"'\"'", "'");
        }
        return normalized;
    }

    private String[] normalizeLines(String value) {
        return defaultString(value).replace("\r\n", "\n").replace('\r', '\n').split("\n");
    }

    private void putIfPresent(Map<String, String> target, String key, String value) {
        if (target != null && hasText(key) && value != null) {
            target.put(key, value);
        }
    }

    private String yamlQuote(String value) {
        return "\"" + defaultString(value).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private String yamlPlainOrQuote(String value) {
        String normalized = defaultString(value);
        return normalized.matches("[A-Za-z0-9._${}/:-]+") ? normalized : yamlQuote(normalized);
    }

    private String shellSingleQuote(String value) {
        return "'" + defaultString(value).replace("'", "'\"'\"'") + "'";
    }

    private List<ParameterDefinition> combineParameters(List<ParameterDefinition> baseParameters,
                                                        List<ParameterDefinition> extraParameters) {
        List<ParameterDefinition> combined = new ArrayList<>(baseParameters);
        combined.addAll(extraParameters);
        return List.copyOf(combined);
    }

    @SafeVarargs
    private final List<ParameterDefinition> combineParameters(List<ParameterDefinition>... parameterGroups) {
        List<ParameterDefinition> combined = new ArrayList<>();
        if (parameterGroups != null) {
            for (List<ParameterDefinition> group : parameterGroups) {
                if (group != null) {
                    combined.addAll(group);
                }
            }
        }
        return List.copyOf(combined);
    }

    private List<ParameterDefinition> buildProjectRootParameters() {
        return List.of(
                parameter(PARAM_PROJECT_ROOT, "项目根目录", TYPE_TEXT, false, "", "例如 services/api 或 apps/web", "相对仓库根目录。留空表示直接在仓库根目录构建；构建命令、Docker context 和部署产物路径都会优先按这里解析", false)
        );
    }

    private List<ParameterDefinition> buildCloneBehaviorParameters() {
        return List.of(
                parameter(PARAM_SKIP_CLONE, "跳过默认克隆", TYPE_SWITCH, false, "false", "", "打开后在 YAML 顶层写入 skip_clone: true，适用于只执行远端命令或准备自行处理代码拉取的场景", false)
        );
    }

    private List<ParameterDefinition> buildSshRemoteParameters() {
        return List.of(
                parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                selectParameter(PARAM_CONNECTION_TYPE, "连接方式", true, CONNECTION_DIRECT_SSH, "选择直连服务器或经 JumpServer 连接目标资产", List.of(CONNECTION_DIRECT_SSH, CONNECTION_JUMPSERVER)),
                dependentParameter(PARAM_DIRECT_SSH_HOST, "目标主机", TYPE_TEXT, true, "", "deploy.example.com", "直连模式下填写目标服务器域名或 IP", false, PARAM_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_DIRECT_SSH_PORT, "目标 SSH 端口", TYPE_TEXT, true, "22", "22", "直连模式下填写目标服务器 SSH 端口", false, PARAM_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_DIRECT_SSH_USER, "目标 SSH 用户", TYPE_TEXT, true, "deploy", "deploy", "直连模式下填写远程登录用户", false, PARAM_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_DIRECT_SSH_PRIVATE_KEY, "目标 SSH 私钥", TYPE_PASSWORD, true, "", "粘贴部署私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true, PARAM_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_JUMP_SERVER_HOST, "堡垒机主机", TYPE_TEXT, true, "", "jump.example.com", "JumpServer 域名或 IP", false, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_JUMP_SERVER_PORT, "堡垒机端口", TYPE_TEXT, true, "2222", "2222", "JumpServer SSH 客户端端口，常见为 2222", false, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_JUMP_SERVER_USER, "堡垒机用户", TYPE_TEXT, true, "", "cicd_bot", "用于登录 JumpServer 的账号", false, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_JUMP_SERVER_PRIVATE_KEY, "堡垒机私钥", TYPE_PASSWORD, true, "", "粘贴 JumpServer 私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_JUMP_TARGET_USER, "目标系统用户", TYPE_TEXT, true, "deploy", "deploy", "JumpServer 直连目标资产时使用的系统账号", false, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_JUMP_TARGET_ASSET_IP, "目标资产 IP", TYPE_TEXT, true, "", "10.10.10.10", "JumpServer 直连的目标资产 IP", false, PARAM_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                parameter("sshCommands", "远程命令", TYPE_TEXTAREA, true, "pwd\nls -la", "cd /srv/app\n./deploy.sh", "以 bash -se 在远端执行，支持多行脚本", false)
        );
    }

    private List<ParameterDefinition> postDeployParameters(String sourcePathDefault,
                                                           String remotePathDefault,
                                                           String commandsDefault) {
        return List.of(
                parameter(PARAM_SERVER_DEPLOY_ENABLED, "部署到服务器", TYPE_SWITCH, false, "false", "", "打开后会在构建完成后追加上传与远程重启步骤", false),
                dependentSelectParameter(PARAM_SERVER_DEPLOY_CONNECTION_TYPE, "连接方式", true, CONNECTION_DIRECT_SSH, "选择直连服务器或经 JumpServer 连接目标资产", List.of(CONNECTION_DIRECT_SSH, CONNECTION_JUMPSERVER), PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_DIRECT_HOST, "目标主机", TYPE_TEXT, true, "", "deploy.example.com", "直连模式下填写目标服务器域名或 IP", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_SERVER_DEPLOY_DIRECT_PORT, "目标 SSH 端口", TYPE_TEXT, true, "22", "22", "直连模式下填写目标服务器 SSH 端口", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_SERVER_DEPLOY_DIRECT_USER, "目标 SSH 用户", TYPE_TEXT, true, "deploy", "deploy", "直连模式下填写远程登录用户", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_SERVER_DEPLOY_DIRECT_PRIVATE_KEY, "目标 SSH 私钥", TYPE_PASSWORD, true, "", "粘贴部署私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_DIRECT_SSH),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_HOST, "堡垒机主机", TYPE_TEXT, true, "", "jump.example.com", "JumpServer 域名或 IP", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_PORT, "堡垒机端口", TYPE_TEXT, true, "2222", "2222", "JumpServer SSH 客户端端口，常见为 2222", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_USER, "堡垒机用户", TYPE_TEXT, true, "", "cicd_bot", "用于登录 JumpServer 的账号", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_PRIVATE_KEY, "堡垒机私钥", TYPE_PASSWORD, true, "", "粘贴 JumpServer 私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_TARGET_USER, "目标系统用户", TYPE_TEXT, true, "deploy", "deploy", "JumpServer 直连目标资产时使用的系统账号", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_JUMP_TARGET_ASSET_IP, "目标资产 IP", TYPE_TEXT, true, "", "10.10.10.10", "JumpServer 直连的目标资产 IP", false, PARAM_SERVER_DEPLOY_CONNECTION_TYPE, CONNECTION_JUMPSERVER),
                dependentParameter(PARAM_SERVER_DEPLOY_SOURCE_PATH, "部署产物路径", TYPE_TEXT, false, sourcePathDefault, "target/*.jar 或 dist", "留空时不上传产物，只执行远程命令；支持单文件、目录或单一 glob 匹配。若配置了项目根目录，这里按项目根目录解析", false, PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_REMOTE_PATH, "服务器目标路径", TYPE_TEXT, false, remotePathDefault, "/srv/app/app.jar 或 /srv/app/dist", "如果填写了部署产物路径，这里填写服务器上的落点路径", false, PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_COMMANDS, "重启 / 发布脚本", TYPE_TEXTAREA, true, commandsDefault, "cd /srv/app\n./restart.sh", "上传完成后在服务器执行，可写多行命令", false, PARAM_SERVER_DEPLOY_ENABLED, "true")
        );
    }

    private static ParameterDefinition parameter(String key,
                                                 String label,
                                                 String type,
                                                 boolean required,
                                                 String defaultValue,
                                                 String placeholder,
                                                 String helpText,
                                                 boolean secret) {
        return parameter(key, label, type, required, ignored -> defaultString(defaultValue), placeholder, helpText, secret, null, null);
    }

    private static ParameterDefinition parameter(String key,
                                                 String label,
                                                 String type,
                                                 boolean required,
                                                 Function<TemplateRenderContext, String> defaultValueProvider,
                                                 String placeholder,
                                                 String helpText,
                                                 boolean secret) {
        return parameter(key, label, type, required, defaultValueProvider, placeholder, helpText, secret, null, null);
    }

    private static ParameterDefinition selectParameter(String key,
                                                       String label,
                                                       boolean required,
                                                       String defaultValue,
                                                       String helpText,
                                                       List<String> options) {
        return parameter(key, label, TYPE_SELECT, required, ignored -> defaultString(defaultValue), "", helpText, false, options, null, null);
    }

    private static ParameterDefinition dependentParameter(String key,
                                                          String label,
                                                          String type,
                                                          boolean required,
                                                          String defaultValue,
                                                          String placeholder,
                                                          String helpText,
                                                          boolean secret,
                                                          String dependsOnKey,
                                                          String dependsOnValue) {
        return parameter(key, label, type, required, ignored -> defaultString(defaultValue), placeholder, helpText, secret, dependsOnKey, dependsOnValue);
    }

    private static ParameterDefinition dependentSelectParameter(String key,
                                                                String label,
                                                                boolean required,
                                                                String defaultValue,
                                                                String helpText,
                                                                List<String> options,
                                                                String dependsOnKey,
                                                                String dependsOnValue) {
        return parameter(key, label, TYPE_SELECT, required, ignored -> defaultString(defaultValue), "", helpText, false, options, dependsOnKey, dependsOnValue);
    }

    private static ParameterDefinition parameter(String key,
                                                 String label,
                                                 String type,
                                                 boolean required,
                                                 Function<TemplateRenderContext, String> defaultValueProvider,
                                                 String placeholder,
                                                 String helpText,
                                                 boolean secret,
                                                 String dependsOnKey,
                                                 String dependsOnValue) {
        return parameter(key, label, type, required, defaultValueProvider, placeholder, helpText, secret, List.of(), dependsOnKey, dependsOnValue);
    }

    private static ParameterDefinition parameter(String key,
                                                 String label,
                                                 String type,
                                                 boolean required,
                                                 Function<TemplateRenderContext, String> defaultValueProvider,
                                                 String placeholder,
                                                 String helpText,
                                                 boolean secret,
                                                 List<String> options,
                                                 String dependsOnKey,
                                                 String dependsOnValue) {
        return new ParameterDefinition(
                key,
                label,
                type,
                required,
                defaultValueProvider,
                placeholder,
                helpText,
                options == null ? List.of() : List.copyOf(options),
                secret,
                dependsOnKey,
                dependsOnValue
        );
    }

    private String trimToNull(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private static String defaultString(String value) {
        return defaultString(value, "");
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public record TemplateRenderContext(
            Long pipelineId,
            String pipelineName,
            String branch,
            String gitlabProjectPath
    ) {
        public static TemplateRenderContext defaultPreview() {
            return new TemplateRenderContext(
                    null,
                    DEFAULT_PIPELINE_NAME,
                    DEFAULT_BRANCH,
                    DEFAULT_GITLAB_PROJECT_PATH
            );
        }
    }

    public record TemplateSecret(
            String name,
            String value,
            String note,
            List<String> events,
            List<String> images
    ) {
    }

    private record TemplateDefinition(
            String code,
            String name,
            String description,
            String category,
            boolean requiresRegistry,
            List<String> requirements,
            List<ParameterDefinition> parameters,
            TemplateRenderer renderer
    ) {
    }

    private record ParameterDefinition(
            String key,
            String label,
            String type,
            boolean required,
            Function<TemplateRenderContext, String> defaultValueProvider,
            String placeholder,
            String helpText,
            List<String> options,
            boolean secret,
            String dependsOnKey,
            String dependsOnValue
    ) {
        private String defaultValue(TemplateRenderContext context) {
            return defaultValueProvider.apply(context);
        }
    }

    private record TemplateRenderInput(
            TemplateRenderContext context,
            Map<String, String> parameters
    ) {
    }

    private record RemoteConnectionSpec(
            String connectionType,
            String host,
            String port,
            String remoteTarget
    ) {
    }

    public record TemplatePrefillResult(
            String prefillMode,
            String templateCode,
            Map<String, String> parameters,
            String rawContent,
            String message
    ) {
    }

    private record MetadataSnapshot(
            String templateCode,
            Map<String, String> parameters
    ) {
    }

    private interface TemplateRenderer {
        String render(TemplateRenderInput input);
    }
}
