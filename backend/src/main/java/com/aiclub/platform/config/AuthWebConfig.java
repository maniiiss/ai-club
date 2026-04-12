package com.aiclub.platform.config;

import com.aiclub.platform.operationlog.OperationLogInterceptor;
import com.aiclub.platform.security.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuthWebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final OperationLogInterceptor operationLogInterceptor;

    public AuthWebConfig(AuthInterceptor authInterceptor,
                         OperationLogInterceptor operationLogInterceptor) {
        this.authInterceptor = authInterceptor;
        this.operationLogInterceptor = operationLogInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**");
        registry.addInterceptor(operationLogInterceptor).addPathPatterns("/api/**");
    }
}
