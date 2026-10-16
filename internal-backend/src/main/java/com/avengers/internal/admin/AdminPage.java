package com.avengers.internal.admin;

import java.util.List;

// Paged response, shaped like the API spec's *Page schemas.
public record AdminPage<T>(List<T> items, PageMetadata page) {

    public record PageMetadata(int page, int size, long totalElements, int totalPages) {
    }

    public static <T> AdminPage<T> of(List<T> items, AdminPageRequest request, long totalElements) {
        int totalPages = (int) ((totalElements + request.size() - 1) / request.size());
        return new AdminPage<>(items, new PageMetadata(request.page(), request.size(), totalElements, totalPages));
    }
}
