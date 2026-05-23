package com.aiclub.platform.service;

import com.aiclub.platform.dto.AiClubPipelineConfigTemplateItem;
import com.aiclub.platform.dto.AiClubPipelineConfigTemplateParameterItem;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
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

    private static final String DEFAULT_CONFIG_PATH = ".woodpecker.yml";
    private static final String DEFAULT_BRANCH = "main";
    private static final String DEFAULT_PIPELINE_NAME = "AI Club Pipeline";
    private static final String DEFAULT_GITLAB_PROJECT_PATH = "group/repo";

    private static final String TYPE_TEXT = "text";
    private static final String TYPE_PASSWORD = "password";
    private static final String TYPE_TEXTAREA = "textarea";
    private static final String TYPE_SWITCH = "switch";
    private static final String PARAM_PROJECT_ROOT = "projectRoot";
    private static final String PARAM_SERVER_DEPLOY_ENABLED = "serverDeployEnabled";
    private static final String PARAM_SERVER_DEPLOY_HOST = "serverDeployHost";
    private static final String PARAM_SERVER_DEPLOY_PORT = "serverDeployPort";
    private static final String PARAM_SERVER_DEPLOY_USER = "serverDeployUser";
    private static final String PARAM_SERVER_DEPLOY_PRIVATE_KEY = "serverDeployPrivateKey";
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
                    combineParameters(buildProjectRootParameters(), List.of(
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
                    combineParameters(buildProjectRootParameters(), List.of(
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
                    combineParameters(buildProjectRootParameters(), List.of(
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
                    combineParameters(buildProjectRootParameters(), List.of(
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
                    List.of("目标服务器允许 SSH 登录", "页面填写主机、账号、私钥和远程命令，私钥写入 Woodpecker repo secret", "适合轻量部署，复杂发布建议迁移到仓库脚本"),
                    List.of(
                            parameter("branch", "触发分支", TYPE_TEXT, true, context -> context.branch(), "main", "写入 when.branch，默认使用流水线默认分支", false),
                            parameter("sshHost", "SSH 主机", TYPE_TEXT, true, "", "deploy.example.com", "目标服务器域名或 IP", false),
                            parameter("sshPort", "SSH 端口", TYPE_TEXT, true, "22", "22", "目标服务器 SSH 端口", false),
                            parameter("sshUser", "SSH 用户", TYPE_TEXT, true, "deploy", "deploy", "远程登录用户", false),
                            parameter("sshPrivateKey", "SSH 私钥", TYPE_PASSWORD, true, "", "粘贴部署私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true),
                            parameter("sshCommands", "远程命令", TYPE_TEXTAREA, true, "pwd\nls -la", "cd /srv/app\n./deploy.sh", "以 bash -se 在远端执行，支持多行脚本", false)
                    ),
                    this::renderSshRemote
            ),
            new TemplateDefinition(
                    "GENERIC_SHELL",
                    "通用 Shell",
                    "适用于暂时只需要跑基础检查命令的仓库。",
                    "通用",
                    false,
                    List.of("默认使用 Alpine 镜像", "可通过表单调整镜像、分支和 Shell 命令", "如需部署到服务器，也可以打开后置部署开关"),
                    combineParameters(buildProjectRootParameters(), List.of(
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
        return template.renderer().render(new TemplateRenderInput(safeContext, effectiveParameters));
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
        if (TEMPLATE_SSH_REMOTE.equals(template.code()) && !hasText(previewValues.get("sshHost"))) {
            previewValues.put("sshHost", "deploy.example.com");
        }
        return previewValues;
    }

    private void validateRequiredVisibleParameters(TemplateDefinition template,
                                                   TemplateRenderContext context,
                                                   Map<String, String> parameters) {
        for (ParameterDefinition parameter : template.parameters()) {
            if (!isParameterActive(parameter, parameters)) {
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
        appendSecret(
                secrets,
                secretName(context, "SSH_PRIVATE_KEY"),
                parameters.get("sshPrivateKey"),
                "AI Club Pipeline SSH 远程部署私钥。",
                List.of("push", "manual"),
                List.of("alpine", "alpine:3.20"),
                requireValues,
                "SSH 私钥不能为空"
        );
        return List.copyOf(secrets);
    }

    private List<TemplateSecret> collectServerDeploySecrets(TemplateRenderContext context,
                                                            Map<String, String> parameters,
                                                            boolean requireValues) {
        List<TemplateSecret> secrets = new ArrayList<>();
        appendSecret(
                secrets,
                secretName(context, "SERVER_DEPLOY_SSH_PRIVATE_KEY"),
                parameters.get(PARAM_SERVER_DEPLOY_PRIVATE_KEY),
                "AI Club Pipeline 后置服务器部署私钥。",
                List.of("push", "manual", "tag"),
                List.of("alpine", "alpine:3.20"),
                requireValues,
                "部署 SSH 私钥不能为空"
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
        StringBuilder builder = new StringBuilder("""
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
        StringBuilder builder = new StringBuilder("""
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
        StringBuilder builder = new StringBuilder("""
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
        StringBuilder builder = new StringBuilder("""
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
        String port = requiredParam(input, "sshPort");
        if (!port.matches("\\d+")) {
            throw new IllegalArgumentException("SSH 端口必须为数字");
        }
        String host = requiredParam(input, "sshHost");
        String user = requiredParam(input, "sshUser");
        String remoteTarget = user + "@" + host;
        List<String> commands = List.of(
                "apk add --no-cache openssh-client",
                "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
                "printf '%s\\n' \"$SSH_PRIVATE_KEY\" > ~/.ssh/id_ai_club && chmod 600 ~/.ssh/id_ai_club",
                "ssh-keyscan -p " + port + " " + shellSingleQuote(host) + " >> ~/.ssh/known_hosts",
                buildRemoteScriptCommand(port, remoteTarget, defaultString(param(input, "sshCommands"), "pwd"))
        );
        return """
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
        ).stripTrailing() + "\n";
    }

    private String renderGenericShell(TemplateRenderInput input) {
        List<String> commands = new ArrayList<>();
        appendProjectRootCommand(commands, input);
        commands.addAll(splitNonBlankLines(param(input, "shellCommands")));
        StringBuilder builder = new StringBuilder("""
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
        String sshPort = requiredParam(input, PARAM_SERVER_DEPLOY_PORT);
        if (!sshPort.matches("\\d+")) {
            throw new IllegalArgumentException("部署 SSH 端口必须为数字");
        }
        String sshHost = requiredParam(input, PARAM_SERVER_DEPLOY_HOST);
        String sshUser = requiredParam(input, PARAM_SERVER_DEPLOY_USER);
        String remoteTarget = sshUser + "@" + sshHost;
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
        commands.add("ssh-keyscan -p " + sshPort + " " + shellSingleQuote(sshHost) + " >> ~/.ssh/known_hosts");
        if (sourcePath != null) {
            commands.add(buildRemoteScriptCommand(sshPort, remoteTarget, buildRemotePrepareScript(remotePath)));
            commands.add("DEPLOY_SOURCE=" + shellSingleQuote(sourcePath));
            commands.add("set -- $DEPLOY_SOURCE");
            commands.add("if [ \"$1\" = \"$DEPLOY_SOURCE\" ] && [ ! -e \"$DEPLOY_SOURCE\" ]; then echo \"未找到部署产物: $DEPLOY_SOURCE\" >&2; exit 1; fi");
            commands.add("if [ \"$#\" -ne 1 ]; then echo \"部署产物路径匹配到多个条目，请调整部署产物路径\" >&2; printf '%s\\n' \"$@\"; exit 1; fi");
            commands.add("deploy_source=\"$1\"");
            commands.add("if [ -d \"$deploy_source\" ]; then scp -r -i ~/.ssh/id_ai_club -P " + sshPort + " \"$deploy_source\" " + shellSingleQuote(remoteTarget + ":" + remotePath)
                    + "; else scp -i ~/.ssh/id_ai_club -P " + sshPort + " \"$deploy_source\" " + shellSingleQuote(remoteTarget + ":" + remotePath) + "; fi");
        }
        commands.add(buildRemoteScriptCommand(sshPort, remoteTarget, buildRemoteDeployScript(remotePath, deployCommands)));

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

    private boolean isParameterActive(ParameterDefinition parameter, Map<String, String> parameters) {
        if (parameter.dependsOnKey() == null) {
            return true;
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

    private List<ParameterDefinition> postDeployParameters(String sourcePathDefault,
                                                           String remotePathDefault,
                                                           String commandsDefault) {
        return List.of(
                parameter(PARAM_SERVER_DEPLOY_ENABLED, "部署到服务器", TYPE_SWITCH, false, "false", "", "打开后会在构建完成后追加上传与远程重启步骤", false),
                dependentParameter(PARAM_SERVER_DEPLOY_HOST, "部署 SSH 主机", TYPE_TEXT, true, "", "deploy.example.com", "目标服务器域名或 IP", false, PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_PORT, "部署 SSH 端口", TYPE_TEXT, true, "22", "22", "目标服务器 SSH 端口", false, PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_USER, "部署 SSH 用户", TYPE_TEXT, true, "deploy", "deploy", "远程登录用户", false, PARAM_SERVER_DEPLOY_ENABLED, "true"),
                dependentParameter(PARAM_SERVER_DEPLOY_PRIVATE_KEY, "部署 SSH 私钥", TYPE_PASSWORD, true, "", "粘贴部署私钥", "不会写入 YAML，平台会写入 Woodpecker repo secret", true, PARAM_SERVER_DEPLOY_ENABLED, "true"),
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
        return new ParameterDefinition(
                key,
                label,
                type,
                required,
                defaultValueProvider,
                placeholder,
                helpText,
                List.of(),
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

    private interface TemplateRenderer {
        String render(TemplateRenderInput input);
    }
}
