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
}
