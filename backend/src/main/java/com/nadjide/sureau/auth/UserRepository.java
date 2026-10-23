package com.nadjide.sureau.auth;

import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final RowMapper<UserAccount> ROW_MAPPER = (row, rowNumber) -> new UserAccount(
            row.getLong("id"), row.getString("username"), row.getString("display_name"),
            row.getString("password_hash"), UserRole.valueOf(row.getString("role")));

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean hasUsers() {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM app_users)", Boolean.class));
    }

    Optional<UserAccount> findByUsername(String username) {
        return jdbc.query("SELECT id, username, display_name, password_hash, role FROM app_users WHERE username = ?",
                ROW_MAPPER, username).stream().findFirst();
    }

    UserAccount createAdministrator(String username, String displayName, String passwordHash) {
        return jdbc.queryForObject("""
                INSERT INTO app_users (username, display_name, password_hash, role)
                VALUES (?, ?, ?, 'ADMIN')
                RETURNING id, username, display_name, password_hash, role
                """, ROW_MAPPER, username, displayName, passwordHash);
    }

    void lockSetup() {
        // Every replica shares this transaction-scoped PostgreSQL lock during initial setup.
        jdbc.execute("SELECT pg_advisory_xact_lock(736873021)");
    }
}
