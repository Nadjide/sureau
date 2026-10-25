package com.nadjide.sureau.auth;

import java.io.Serial;

import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;

/** Security state is captured when credentials are loaded, before authentication completes. */
public final class SessionPrincipal extends User {
    @Serial
    private static final long serialVersionUID = 1L;

    private final long id;
    private final long authVersion;

    SessionPrincipal(UserAccount account) {
        super(account.username(), account.passwordHash(), account.enabled(), true, true, true,
                AuthorityUtils.createAuthorityList("ROLE_" + account.role().name()));
        this.id = account.id();
        this.authVersion = account.authVersion();
    }

    public long getId() {
        return id;
    }

    public long getAuthVersion() {
        return authVersion;
    }
}
