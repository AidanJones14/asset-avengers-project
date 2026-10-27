package com.avengers.internal.common;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

// Preserve explicit API errors without leaking database or upstream credentials.
@RestControllerAdvice
public class InternalExceptionHandler {
    @ExceptionHandler(ErrorResponseException.class)
    public ProblemDetail status(ErrorResponseException ex) {return ex.getBody();}
    @ExceptionHandler({MethodArgumentTypeMismatchException.class,MethodArgumentNotValidException.class})
    public ProblemDetail invalid(Exception ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"Invalid request parameters");
    }
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    public ProblemDetail database(Exception ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,"Reporting data is temporarily unavailable");
    }
}
