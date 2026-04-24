package com.aiclub.platform.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Hindsight 库内回退查询配置。
 * 当 Hindsight HTTP 服务因模型初始化或外部依赖不可用而启动失败时，
 * 记忆事实图仍可直接读取 Hindsight 数据库中的实体、关系与事实快照。
 */
@Configuration
public class HindsightMemoryFallbackConfig {

    @Bean(name = "hindsightMemoryJdbcTemplate")
    public NamedParameterJdbcTemplate hindsightMemoryJdbcTemplate(
            HindsightProperties hindsightProperties
    ) {
        // 回退查询只需要独立 JDBC 模板，不能再声明 DataSource Bean，
        // 否则会让 Spring Boot 误把 Hindsight 库当成应用主数据源。
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.postgresql.Driver");
        dataSource.setUrl(hindsightProperties.getMemoryFactDatabaseUrl());
        dataSource.setUsername(hindsightProperties.getMemoryFactDatabaseUsername());
        dataSource.setPassword(hindsightProperties.getMemoryFactDatabasePassword());
        return new NamedParameterJdbcTemplate(dataSource);
    }
}
