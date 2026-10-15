package com.avengers.endgame.instrument;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

import java.util.UUID;

public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {
	Optional<Instrument> findBySymbol(String symbol);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from Instrument i where i.instrumentId = :instrumentId")
	Optional<Instrument> findByIdForUpdate(@Param("instrumentId") UUID instrumentId);
}