package com.aiclub.platform.security;

import java.util.Optional;

public final class AuthContextHolder {

    private static final ThreadLocal<AuthContext> HOLDER = new ThreadLocal<>();

    private AuthContextHolder() {
    }

    public static void set(AuthContext authContext) {
        HOLDER.set(authContext);
    }

    public static Optional<AuthContext> get() {
        return Optional.ofNullable(HOLDER.get());
    }

    public static void clear() {
        HOLDER.remove();
    }
}
