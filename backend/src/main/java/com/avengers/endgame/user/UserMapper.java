package com.avengers.endgame.user;

import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public User toEntity(CreateUserRequestDto dto) {
        return new User(dto.userId(), dto.name(), dto.role());
    }

    public UserResponseDto toResponse(User user) {
        return new UserResponseDto(
                user.getUserId(),
                user.getName(),
                user.getRole()
        );
    }
}


