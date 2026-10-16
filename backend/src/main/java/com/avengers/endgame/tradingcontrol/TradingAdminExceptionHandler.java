package com.avengers.endgame.tradingcontrol;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

// Keep command validation errors meaningful when the internal API forwards them.
// In particular, a malformed UUID must not reach the general runtime-error handler.
@RestControllerAdvice(assignableTypes = TradingAdminCommandController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TradingAdminExceptionHandler {
    @ExceptionHandler(ErrorResponseException.class)
    public ProblemDetail status(ErrorResponseException exception) {
        return exception.getBody();
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail invalidParameter(MethodArgumentTypeMismatchException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Invalid value for " + exception.getName());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail invalidBody(HttpMessageNotReadableException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Request body is missing or malformed");
    }
}
