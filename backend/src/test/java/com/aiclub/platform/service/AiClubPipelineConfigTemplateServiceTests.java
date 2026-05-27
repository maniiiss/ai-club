package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiClubPipelineConfigTemplateServiceTests {

    private final AiClubPipelineConfigTemplateService service = new AiClubPipelineConfigTemplateService();

    /**
     * 验证 SSH_REMOTE 模板在直连模式下会生成普通的 user@host SSH 命令。
     */
    @Test
    void shouldRenderDirectSshRemoteTemplate() {
        String content = service.renderTemplate(
                AiClubPipelineConfigTemplateService.TEMPLATE_SSH_REMOTE,
                context(),
                Map.of(
                        "connectionType", "DIRECT_SSH",
                        "directSshHost", "deploy.example.com",
                        "directSshPort", "22",
                        "directSshUser", "deploy",
                        "sshCommands", "pwd"
                )
        );

        assertThat(content).contains("ssh-keyscan -p 22 'deploy.example.com'");
        assertThat(content).contains("ssh -i ~/.ssh/id_ai_club -p 22 'deploy@deploy.example.com' 'bash -se'");
        assertThat(content).doesNotContain("cicd_bot@deploy@10.10.10.10@jump.example.com");
    }

    /**
     * 验证 SSH_REMOTE 模板在 JumpServer 模式下会生成堡垒机直连资产命令。
     */
    @Test
    void shouldRenderJumpServerSshRemoteTemplate() {
        String content = service.renderTemplate(
                AiClubPipelineConfigTemplateService.TEMPLATE_SSH_REMOTE,
                context(),
                Map.of(
                        "connectionType", "JUMPSERVER",
                        "jumpServerHost", "jump.example.com",
                        "jumpServerPort", "2222",
                        "jumpServerUser", "cicd_bot",
                        "jumpTargetUser", "deploy",
                        "jumpTargetAssetIp", "10.10.10.10",
                        "sshCommands", "pwd"
                )
        );

        assertThat(content).contains("ssh-keyscan -p 2222 'jump.example.com'");
        assertThat(content).contains("ssh -i ~/.ssh/id_ai_club -p 2222 'cicd_bot@deploy@10.10.10.10@jump.example.com' 'bash -se'");
    }

    /**
     * 验证后置部署在 JumpServer 模式下会统一使用堡垒机直连资产的 scp/ssh 目标串。
     */
    @Test
    void shouldRenderJumpServerServerDeployStep() {
        String content = service.renderTemplate(
                "NODE_VITE",
                context(),
                Map.ofEntries(
                        Map.entry("branch", "main"),
                        Map.entry("nodeImage", "node:20-alpine"),
                        Map.entry("installCommand", "npm ci"),
                        Map.entry("buildCommand", "npm run build"),
                        Map.entry("serverDeployEnabled", "true"),
                        Map.entry("serverDeployConnectionType", "JUMPSERVER"),
                        Map.entry("serverDeployJumpHost", "jump.example.com"),
                        Map.entry("serverDeployJumpPort", "2222"),
                        Map.entry("serverDeployJumpUser", "cicd_bot"),
                        Map.entry("serverDeployJumpTargetUser", "deploy"),
                        Map.entry("serverDeployJumpTargetAssetIp", "10.10.10.20"),
                        Map.entry("serverDeploySourcePath", "dist"),
                        Map.entry("serverDeployRemotePath", "/srv/app/dist"),
                        Map.entry("serverDeployCommands", "cd /srv/app\n./restart.sh")
                )
        );

        assertThat(content).contains("cicd_bot@deploy@10.10.10.20@jump.example.com:/srv/app/dist");
        assertThat(content).contains("ssh -i ~/.ssh/id_ai_club -p 2222 'cicd_bot@deploy@10.10.10.20@jump.example.com' 'bash -se'");
    }

    /**
     * 验证 secret 收集会根据连接方式选择不同的私钥字段。
     */
    @Test
    void shouldCollectDifferentSecretsForDirectAndJumpServerModes() {
        List<AiClubPipelineConfigTemplateService.TemplateSecret> directSecrets = service.collectSecrets(
                AiClubPipelineConfigTemplateService.TEMPLATE_SSH_REMOTE,
                context(),
                Map.of(
                        "connectionType", "DIRECT_SSH",
                        "directSshPrivateKey", "direct-key"
                ),
                true
        );
        List<AiClubPipelineConfigTemplateService.TemplateSecret> jumpSecrets = service.collectSecrets(
                AiClubPipelineConfigTemplateService.TEMPLATE_SSH_REMOTE,
                context(),
                Map.of(
                        "connectionType", "JUMPSERVER",
                        "jumpServerPrivateKey", "jump-key"
                ),
                true
        );

        assertThat(directSecrets).singleElement().extracting(AiClubPipelineConfigTemplateService.TemplateSecret::value).isEqualTo("direct-key");
        assertThat(jumpSecrets).singleElement().extracting(AiClubPipelineConfigTemplateService.TemplateSecret::value).isEqualTo("jump-key");
    }

    /**
     * 验证 JumpServer 模式缺少关键字段时会给出明确错误，避免生成半成品 YAML。
     */
    @Test
    void shouldRejectMissingJumpServerFields() {
        assertThatThrownBy(() -> service.renderTemplate(
                AiClubPipelineConfigTemplateService.TEMPLATE_SSH_REMOTE,
                context(),
                Map.of(
                        "connectionType", "JUMPSERVER",
                        "jumpServerHost", "jump.example.com",
                        "jumpServerPort", "not-a-number",
                        "jumpServerUser", "cicd_bot",
                        "jumpTargetUser", "deploy",
                        "jumpTargetAssetIp", "10.10.10.10",
                        "sshCommands", "pwd"
                )
        )).hasMessage("JumpServer 端口必须为数字");
    }

    private AiClubPipelineConfigTemplateService.TemplateRenderContext context() {
        return new AiClubPipelineConfigTemplateService.TemplateRenderContext(
                12L,
                "示例流水线",
                "main",
                "group/repo"
        );
    }
}
