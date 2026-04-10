package com.aiclub.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AiAgentPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiAgentPlatformApplication.class, args);
    }
}
