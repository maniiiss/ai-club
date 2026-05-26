package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import net.schmizz.sshj.sftp.FileMode;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SshjServerSshGatewayTests {

    @Test
    void shouldUseConcreteFormatPlaceholdersInProbeCommand() {
        String command = SshjServerSshGateway.probeCommand();

        assertThat(command).contains("read _ cpu_user");
        assertThat(command).contains("printf \"cpu=%s\\nmem=%s\\ndisk=%s\\n\"");
        assertThat(command).contains("printf \\\"%d\\\"");
        assertThat(command).doesNotContain("%%s");
        assertThat(command).doesNotContain("%%d");
    }

    @Test
    void shouldParseProbeResultIntoCpuMemoryAndDiskPercentages() {
        Map<String, Integer> parsed = SshjServerSshGateway.parseProbeResult("""
                cpu=17
                mem=63
                disk=81
                """);

        assertThat(parsed).containsEntry("cpu", 17);
        assertThat(parsed).containsEntry("mem", 63);
        assertThat(parsed).containsEntry("disk", 81);
    }

    @Test
    void shouldFormatSftpFileModeAsPosixPermissionText() {
        assertThat(SshjServerSshGateway.formatFileMode(new FileMode(040755))).isEqualTo("drwxr-xr-x");
        assertThat(SshjServerSshGateway.formatFileMode(new FileMode(0100600))).isEqualTo("-rw-------");
        assertThat(SshjServerSshGateway.formatFileMode(new FileMode(0120777))).isEqualTo("lrwxrwxrwx");
    }
}
