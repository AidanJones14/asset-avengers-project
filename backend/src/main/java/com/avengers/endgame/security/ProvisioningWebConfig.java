package com.avengers.endgame.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// Web (Spring MVC) configuration is the layer that turns an HTTP request into a controller method call
// It also converts the controller return value to JSON
// This is the layer where request interceptors must be registered
// Spring MVC only runs interceptors that are registered, so @Component on
//      UserProvisioningInterceptor isn't enough on its own
// Servlet Filters are different than interceptors:
//      They are in their own container and deal with raw requests and responses (like http call and pipe in node)
//      The interceptors only deal with filtered requests and has access to handlers and routes
// At startup, Spring Boot calls addInterceptors on every WebMvcConfigurer bean
//   and adds the result to its own MVC setup
@Configuration
public class ProvisioningWebConfig implements WebMvcConfigurer {

    private final UserProvisioningInterceptor userProvisioningInterceptor;

    // Constructor injection: Spring passes in the interceptor bean
    public ProvisioningWebConfig(UserProvisioningInterceptor userProvisioningInterceptor) {
        this.userProvisioningInterceptor = userProvisioningInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Only API requests. Swagger (/v3/api-docs, /swagger-ui) and /error never provision anyone
        registry.addInterceptor(userProvisioningInterceptor).addPathPatterns("/api/v1/**");
    }
}
