package com.nadjide.sureau.auth;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserAdministrationService {
    private final UserRepository users;
    private final PasswordEncoder passwords;

    public UserAdministrationService(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> list(SessionPrincipal actor) {
        requireAdministrator(actor);
        return users.findAll();
    }

    @Transactional
    public AdminUserResponse create(SessionPrincipal actor, CreateUserRequest request) {
        users.lockAccounts();
        requireAdministrator(actor);
        AccountValidation.password(request.password());
        AccountValidation.displayName(request.displayName());
        return users.create(request.username(), request.displayName(), passwords.encode(request.password()), request.role())
                .adminResponse();
    }

    @Transactional
    public AdminUserResponse update(SessionPrincipal actor, long id, UpdateUserRequest request) {
        users.lockAccounts();
        requireAdministrator(actor);
        if (id <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A positive account identifier is required.");
        UserAccount target = users.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "The requested account does not exist."));
        AccountValidation.displayName(request.displayName());
        boolean removesEnabledAdministrator = target.enabled() && target.role() == UserRole.ADMIN
                && (!request.enabled() || request.role() != UserRole.ADMIN);
        if (removesEnabledAdministrator && users.countEnabledAdministrators() <= 1) {
            throw new UserAdministrationException(HttpStatus.CONFLICT, "LAST_ADMIN_REQUIRED",
                    "At least one enabled administrator must remain.");
        }
        boolean securityChanged = target.role() != request.role() || target.enabled() != request.enabled();
        UserAccount saved = users.update(id, request.displayName(), request.role(), request.enabled(), securityChanged);
        if (securityChanged) users.revokeSessions(saved.username());
        return saved.adminResponse();
    }

    @Transactional
    public void resetPassword(SessionPrincipal actor, long id, ResetPasswordRequest request) {
        users.lockAccounts();
        requireAdministrator(actor);
        if (id <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A positive account identifier is required.");
        UserAccount target = users.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "The requested account does not exist."));
        AccountValidation.password(request.password());
        UserAccount saved = users.updatePassword(target.id(), passwords.encode(request.password()));
        users.revokeSessions(saved.username());
    }

    private UserAccount requireAdministrator(SessionPrincipal actor) {
        if (actor == null) throw unauthenticated();
        UserAccount account = users.findById(actor.getId()).orElseThrow(UserAdministrationService::unauthenticated);
        if (!account.enabled() || !account.username().equals(actor.getUsername())
                || account.authVersion() != actor.getAuthVersion()) throw unauthenticated();
        if (account.role() != UserRole.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator access is required.");
        }
        return account;
    }

    private static ResponseStatusException unauthenticated() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "The account session is no longer valid.");
    }
}
