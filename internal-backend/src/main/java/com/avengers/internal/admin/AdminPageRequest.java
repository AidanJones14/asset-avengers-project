package com.avengers.internal.admin;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public record AdminPageRequest(int page, int size) {

    public static final int MAX_SIZE = 100;

    public AdminPageRequest {
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must be >= 0");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "size must be between 1 and " + MAX_SIZE);
        }
    }

    public long offset() {
        return (long) page * size;
    }
}
