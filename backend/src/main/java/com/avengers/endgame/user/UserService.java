package com.avengers.endgame.user;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;

    public UserService(UserRepository userRepository, UserMapper userMapper) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
    }

    public UserResponseDto createUser(CreateUserRequestDto request) {

        User user = userMapper.toEntity(request);
        if (userRepository.existsById(user.getUserId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "user already exists");
        }

        User savedUser = userRepository.save(user);
        return userMapper.toResponse(savedUser);
    }
}


