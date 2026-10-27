package com.avengers.internal.analytics;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import static org.junit.jupiter.api.Assertions.*;

class SupersetWorkspaceTest {
    @AfterEach void cleanup() { RequestContextHolder.resetRequestAttributes(); }
    private SupersetGateway gateway(String publicUrl, int port) {
        return new SupersetGateway(null, "http://superset:8088", publicUrl, "internal-api", "unused", port);
    }
    @Test void automaticAddressUsesTheVmHostAndConfiguredSupersetPort() {
        var request = new MockHttpServletRequest();
        request.setScheme("http"); request.setServerName("192.168.1.45"); request.setServerPort(8086);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        assertEquals("http://192.168.1.45:8090/sqllab/", gateway("auto",8090).workspace().get("url"));
    }
    @Test void explicitPublicAddressPreservesDeploymentPrefix() {
        assertEquals("https://reports.example.com/superset/sqllab/",
            gateway("https://reports.example.com/superset/",8088).workspace().get("url"));
    }
}
