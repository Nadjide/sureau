package com.nadjide.sureau.auth;

import java.util.Optional;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final String COLUMNS = "id, username, display_name, password_hash, role, enabled, auth_version";
    private static final RowMapper<UserAccount> ROW_MAPPER = (row, rowNumber) -> new UserAccount(
            row.getLong("id"), row.getString("username"), row.getString("display_name"),
            row.getString("password_hash"), UserRole.valueOf(row.getString("role")), row.getBoolean("enabled"),
            row.getLong("auth_version"));

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean hasUsers() {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM app_users)", Boolean.class));
    }

    Optional<UserAccount> findByUsername(String username) {
        return jdbc.query("SELECT " + COLUMNS + " FROM app_users WHERE username = ?",
                ROW_MAPPER, username).stream().findFirst();
    }

    Optional<UserAccount> findById(long id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM app_users WHERE id = ?", ROW_MAPPER, id)
                .stream().findFirst();
    }

    Optional<AccountSecurityState> findSecurityStateById(long id) {
        return jdbc.query("SELECT id, username, enabled, auth_version FROM app_users WHERE id = ?",
                (row, rowNumber) -> new AccountSecurityState(row.getLong("id"), row.getString("username"),
                        row.getBoolean("enabled"), row.getLong("auth_version")), id).stream().findFirst();
    }

    List<AdminUserResponse> findAll() {
        return jdbc.query("SELECT id, username, display_name, role, enabled FROM app_users ORDER BY username, id",
                (row, rowNumber) -> new AdminUserResponse(row.getLong("id"), row.getString("username"),
                        row.getString("display_name"), UserRole.valueOf(row.getString("role")), row.getBoolean("enabled")));
    }

    UserAccount createAdministrator(String username, String displayName, String passwordHash) {
        return jdbc.queryForObject("""
                INSERT INTO app_users (username, display_name, password_hash, role)
                VALUES (?, ?, ?, 'ADMIN')
                RETURNING %s
                """.formatted(COLUMNS), ROW_MAPPER, username, displayName, passwordHash);
    }

    UserAccount create(String username, String displayName, String passwordHash, UserRole role) {
        return jdbc.queryForObject("""
                INSERT INTO app_users (username, display_name, password_hash, role)
                VALUES (?, ?, ?, ?)
                RETURNING %s
                """.formatted(COLUMNS), ROW_MAPPER, username, displayName, passwordHash, role.name());
    }

    UserAccount update(long id, String displayName, UserRole role, boolean enabled, boolean securityChanged) {
        return jdbc.queryForObject("""
                UPDATE app_users
                SET display_name = ?, role = ?, enabled = ?, auth_version = auth_version + ?
                WHERE id = ?
                RETURNING %s
                """.formatted(COLUMNS), ROW_MAPPER, displayName, role.name(), enabled, securityChanged ? 1 : 0, id);
    }

    long countEnabledAdministrators() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE enabled = TRUE AND role = 'ADMIN'", Long.class);
    }

    void revokeSessions(String username) {
        jdbc.update("DELETE FROM spring_session WHERE principal_name = ?", username);
    }

    void lockAccounts() {
        jdbc.execute("SELECT pg_advisory_xact_lock(736873021)");
    }

    void lockSetup() {
        // Every replica shares this transaction-scoped PostgreSQL lock during initial setup.
        lockAccounts();
    }

    record AccountSecurityState(long id, String username, boolean enabled, long authVersion) {}
}
