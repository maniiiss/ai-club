package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.dto.request.CreditAdjustmentRequest;
import com.aiclub.platform.dto.request.CreditFeatureConfigRequest;
import com.aiclub.platform.dto.request.CreditGlobalConfigRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 积分管理接口权限测试，确保后台配置与调账能力不会暴露给只有公众端登录态的用户。
 */
class CreditControllerPermissionTests {

    @Test
    void shouldProtectManagementCreditEndpointsWithViewOrManagePermissions() throws NoSuchMethodException {
        assertPermission("getGlobalConfig", "system:credit:view");
        assertPermission("updateGlobalConfig", "system:credit:manage", CreditGlobalConfigRequest.class);
        assertPermission("listFeatureConfigs", "system:credit:view");
        assertPermission("saveFeatureConfig", "system:credit:manage", CreditFeatureConfigRequest.class);
        assertPermission("pageAccounts", "system:credit:view", int.class, int.class, String.class);
        assertPermission("backfillAccounts", "system:credit:manage");
        assertPermission("adjustAccount", "system:credit:manage", Long.class, CreditAdjustmentRequest.class);
        assertPermission("pageAccountTransactions", "system:credit:view", Long.class, int.class, int.class);
    }

    @Test
    void shouldKeepPublicCreditEndpointsWithoutManagementPermissionAnnotation() throws NoSuchMethodException {
        assertThat(CreditController.class.getMethod("getCurrentAccount").getAnnotation(RequirePermission.class)).isNull();
        assertThat(CreditController.class.getMethod("pageCurrentAccountTransactions", int.class, int.class).getAnnotation(RequirePermission.class)).isNull();
    }

    private void assertPermission(String methodName, String permission, Class<?>... parameterTypes) throws NoSuchMethodException {
        RequirePermission annotation = CreditController.class.getMethod(methodName, parameterTypes).getAnnotation(RequirePermission.class);
        assertThat(annotation).isNotNull();
        assertThat(annotation.value()).isEqualTo(permission);
    }
}
