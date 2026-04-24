package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import javax.sql.DataSource;

/**
 * Hindsight 库内回退查询配置。
 * 当 Hindsight HTTP 服务因模型初始化或外部依赖不可用而启动失败时，
 * 记忆事实图仍可直接读取 Hindsight 数据库中的实体、关系与事实快照。
 */
@Configuration
public class HindsightMemoryFallbackConfig {

    @Bean(name = "hindsightMemoryDataSource")
    public DataSource hindsightMemoryDataSource(HindsightProperties hindsightProperties) {
        return DataSourceBuilder.create()
                .driverClassName("org.postgresql.Driver")
                .url(hindsightProperties.getMemoryFactDatabaseUrl())
                .username(hindsightProperties.getMemoryFactDatabaseUsername())
                .password(hindsightProperties.getMemoryFactDatabasePassword())
                .build();
    }

    @Bean(name = "hindsightMemoryJdbcTemplate")
    public NamedParameterJdbcTemplate hindsightMemoryJdbcTemplate(
            @Qualifier("hindsightMemoryDataSource") DataSource dataSource
    ) {
        return new NamedParameterJdbcTemplate(dataSource);
    }
}
