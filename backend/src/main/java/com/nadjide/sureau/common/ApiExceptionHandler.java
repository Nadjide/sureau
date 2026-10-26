package com.nadjide.sureau.common;

import java.net.URI;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import com.nadjide.sureau.asset.service.AssetImportException;
import com.nadjide.sureau.asset.service.AssetStatusConflictException;
import com.nadjide.sureau.auth.UserAdministrationException;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException exception,
                                            HttpServletRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "The request contains invalid fields.", request);
        List<FieldError> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldError(error.getField(), error.getDefaultMessage()))
                .sorted(Comparator.comparing(FieldError::field).thenComparing(FieldError::message))
                .toList();
        problem.setProperty("errors", errors);
        return response(problem);
    }

    @ExceptionHandler(AssetImportException.class)
    ResponseEntity<ProblemDetail> invalidImport(AssetImportException exception, HttpServletRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "The import contains invalid rows. Nothing was imported.", request);
        problem.setProperty("errors", exception.errors());
        return response(problem);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> malformed(HttpMessageNotReadableException exception,
                                           HttpServletRequest request) {
        return response(problem(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST",
                "The request body is missing or contains invalid JSON values.", request));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> invalidParameter(MethodArgumentTypeMismatchException exception,
                                                  HttpServletRequest request) {
        return response(problem(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER",
                "The request contains an invalid parameter.", request));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ProblemDetail> businessRule(ResponseStatusException exception,
                                              HttpServletRequest request) {
        String code = exception instanceof AssetStatusConflictException ? "ASSET_STATUS_CONFLICT"
                : exception instanceof UserAdministrationException accountException ? accountException.code()
                : switch (exception.getStatusCode().value()) {
            case 400 -> "INVALID_REQUEST";
            case 404 -> "NOT_FOUND";
            case 401 -> "AUTHENTICATION_REQUIRED";
            case 403 -> "ACCESS_DENIED";
            case 409 -> "CONFLICT";
            case 412 -> "ASSET_CONFLICT";
            default -> "REQUEST_FAILED";
        };
        return response(problem(exception.getStatusCode(), code,
                exception.getReason() == null ? "The request could not be completed." : exception.getReason(), request));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ProblemDetail> concurrentUpdate(OptimisticLockingFailureException exception,
                                                   HttpServletRequest request) {
        return response(problem(HttpStatus.PRECONDITION_FAILED, "ASSET_CONFLICT",
                "The asset changed since it was loaded. Reload it before saving.", request));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> integrity(DataIntegrityViolationException exception,
                                           HttpServletRequest request) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sqlException && "23505".equals(sqlException.getSQLState())) {
                return response(problem(HttpStatus.CONFLICT, "DUPLICATE_RESOURCE",
                        "A resource with the same unique identifier already exists.", request));
            }
        }
        return response(problem(HttpStatus.INTERNAL_SERVER_ERROR, "PERSISTENCE_ERROR",
                "The change could not be saved.", request));
    }

    private static ProblemDetail problem(HttpStatusCode status, String code, String detail,
                                         HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        return problem;
    }

    private static ResponseEntity<ProblemDetail> response(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    public record FieldError(String field, String message) {}
}
