package com.avengers.endgame.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class OrderExceptionHandler {
    @ExceptionHandler(OrderValidationException.class)
    public ProblemDetail handleValidation(OrderValidationException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid order");
        problem.setProperty("code", "VALIDATION_ERROR");
        return problem;
    }

    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ProblemDetail handleHttpError(org.springframework.web.server.ResponseStatusException exception) {
        return ProblemDetail.forStatusAndDetail(exception.getStatusCode(),
                exception.getReason() != null ? exception.getReason() : "Request failed");
    }

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ProblemDetail handleMalformedRequest(org.springframework.http.converter.HttpMessageNotReadableException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid order request body");
    }

    @ExceptionHandler(RuntimeException.class)
    public ProblemDetail handleInstrumentNotFound(RuntimeException exception) {
        if (exception.getMessage() != null && exception.getMessage().contains("Instrument not found")) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                "Stock symbol not found in database"
            );
            problem.setTitle("Instrument not found");
            problem.setProperty("code", "INSTRUMENT_NOT_FOUND");
            return problem;
        }
        
        // For other RuntimeExceptions, return 500
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR,
            exception.getMessage() != null ? exception.getMessage() : "An unexpected error occurred"
        );
        problem.setTitle("Internal server error");
        problem.setProperty("code", "INTERNAL_ERROR");
        return problem;
    }
}

