package com.nadjide.sureau.auth;

import java.util.List;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserAdministrationService users;

    public UserController(UserAdministrationService users) {
        this.users = users;
    }

    @GetMapping
    public List<AdminUserResponse> list(Authentication authentication) {
        return users.list(principal(authentication));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse create(Authentication authentication, @Valid @RequestBody CreateUserRequest request) {
        return users.create(principal(authentication), request);
    }

    @PutMapping("/{id}")
    public AdminUserResponse update(Authentication authentication, @PathVariable long id,
                                    @Valid @RequestBody UpdateUserRequest request) {
        return users.update(principal(authentication), id, request);
    }

    private SessionPrincipal principal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required.");
        }
        return principal;
    }
}
