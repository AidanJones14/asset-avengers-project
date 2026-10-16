package com.avengers.internal.admin;

import java.util.UUID;

/** Admin-only target picker: account identity is explicit even for duplicate names. */
public record AdminClientSuggestionDto(UUID clientId, UUID accountId, String fullName,
                                       String email, boolean suspended) {}
