package com.nadjide.sureau.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final String setupToken;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder,
                       @Value("${sureau.setup-token:}") String setupToken) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.setupToken = setupToken;
    }

    public boolean setupRequired() {
        return !users.hasUsers();
    }

    @Transactional
    public UserResponse setup(SetupRequest request) {
        users.lockSetup();
        if (users.hasUsers()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Initial setup has already been completed.");
        }
        if (setupToken.isBlank() || !MessageDigest.isEqual(setupToken.getBytes(StandardCharsets.UTF_8),
                request.setupToken().getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Initial setup is disabled or the setup token is invalid.");
        }
        AccountValidation.password(request.password());
        AccountValidation.displayName(request.displayName());
        return users.createAdministrator(request.username(), request.displayName(), passwordEncoder.encode(request.password()))
                .response();
    }

    public UserResponse currentUser(String username) {
        return users.findByUsername(username).filter(UserAccount::enabled).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "The user no longer exists.")).response();
    }

    @Transactional
    public void changeOwnPassword(SessionPrincipal actor, ChangePasswordRequest request) {
        users.lockAccounts();
        if (actor == null) throw invalidSession();
        UserAccount account = users.findById(actor.getId()).orElseThrow(AuthService::invalidSession);
        if (!account.enabled() || !account.username().equals(actor.getUsername())
                || account.authVersion() != actor.getAuthVersion()) throw invalidSession();
        AccountValidation.password(request.newPassword());
        if (!passwordEncoder.matches(request.currentPassword(), account.passwordHash())) {
            throw new UserAdministrationException(HttpStatus.BAD_REQUEST, "CURRENT_PASSWORD_INVALID",
                    "The current password is incorrect.");
        }
        UserAccount saved = users.updatePassword(account.id(), passwordEncoder.encode(request.newPassword()));
        users.revokeSessions(saved.username());
    }

    private static ResponseStatusException invalidSession() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "The account session is no longer valid.");
    }
}
