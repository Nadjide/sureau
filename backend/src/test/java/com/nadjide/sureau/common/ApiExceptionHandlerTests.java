package com.nadjide.sureau.common;

import java.sql.SQLException;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTests {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void databaseUniqueViolationsBecomeConflictsWithoutExposingSql() {
        var exception = new DataIntegrityViolationException("private SQL", new SQLException("private constraint", "23505"));
        var response = handler.integrity(exception, new MockHttpServletRequest("POST", "/api/assets"));
        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(response.getBody().getProperties()).containsEntry("code", "DUPLICATE_RESOURCE");
        assertThat(response.getBody().getDetail()).doesNotContain("private");
    }

    @Test
    void otherDatabaseFailuresAreNotMisrepresentedAsDuplicates() {
        var exception = new DataIntegrityViolationException("private SQL", new SQLException("private check", "23514"));
        var response = handler.integrity(exception, new MockHttpServletRequest("PUT", "/api/assets/1"));
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().getProperties()).containsEntry("code", "PERSISTENCE_ERROR");
        assertThat(response.getBody().getDetail()).doesNotContain("private");
    }
}
