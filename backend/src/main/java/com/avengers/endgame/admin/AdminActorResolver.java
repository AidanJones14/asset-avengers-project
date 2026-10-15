package com.avengers.endgame.admin;

import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import com.avengers.endgame.user.UserRole;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

// Works out which admin is making a request. Until auth is wired in, the caller
// names themselves in the X-Admin-Id header; this is the only class that has to
// change when they come from the JWT instead.
@Component
public class AdminActorResolver {

    public static final String ADMIN_ID_HEADER = "X-Admin-Id";

    private final UserRepository userRepository;

    public AdminActorResolver(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // TODO(oauth): take the actor from the JWT (sub and email) instead of a request header.
    public AdminActor resolve(UUID adminId) {
        if (adminId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ADMIN_ID_HEADER + " header is required");
        }
        User user = userRepository.findById(adminId)
                .filter(candidate -> candidate.getRole() == UserRole.admin)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required"));
        return new AdminActor(user.getUserId(), user.getEmail());
    }
}
