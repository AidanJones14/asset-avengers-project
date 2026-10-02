package com.avengers.endgame.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    // Adds the user unless a row with this id already exists. Postgres checks and
    // inserts in one step, so two first requests arriving together can't both insert.
    // Returns 1 if the row was added, 0 if it was already there.
    @Modifying
    @Query(value = """
            INSERT INTO users (user_id, email, role)
            VALUES (:userId, :email, :role)
            ON CONFLICT (user_id) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("userId") UUID userId,
                       @Param("email") String email,
                       @Param("role") String role);
}
