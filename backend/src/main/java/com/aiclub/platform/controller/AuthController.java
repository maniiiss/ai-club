package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.LoginResult;
import com.aiclub.platform.dto.request.ChangePasswordRequest;
import com.aiclub.platform.dto.request.LoginRequest;
import com.aiclub.platform.dto.request.RegisterRequest;
import com.aiclub.platform.dto.request.UpdateProfileRequest;
import com.aiclub.platform.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@OperationLog(moduleCode = "AUTH", moduleName = "认证与账户", bizType = "USER")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    @OperationLog(actionCode = "AUTH_LOGIN", actionName = "登录")
    public ApiResponse<LoginResult> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request));
    }

    @PostMapping("/register")
    @OperationLog(actionCode = "AUTH_REGISTER", actionName = "注册")
    public ApiResponse<Void> register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return new ApiResponse<>(true, "Registered successfully", null);
    }

    @GetMapping("/me")
    public ApiResponse<CurrentUserInfo> currentUser() {
        return ApiResponse.success(authService.currentUser());
    }

    @PutMapping("/profile")
    @OperationLog(actionCode = "AUTH_UPDATE_PROFILE", actionName = "修改个人资料")
    public ApiResponse<CurrentUserInfo> updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponse.success(authService.updateProfile(request));
    }

    @PostMapping("/change-password")
    @OperationLog(actionCode = "AUTH_CHANGE_PASSWORD", actionName = "修改密码")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(request);
        return new ApiResponse<>(true, "Password changed successfully", null);
    }

    @PostMapping("/logout")
    @OperationLog(actionCode = "AUTH_LOGOUT", actionName = "退出登录")
    public ApiResponse<Void> logout(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                                    HttpServletRequest servletRequest,
                                    HttpServletResponse servletResponse) {
        authService.logout(authorization);
        return new ApiResponse<>(true, "Logged out successfully", null);
    }
}
