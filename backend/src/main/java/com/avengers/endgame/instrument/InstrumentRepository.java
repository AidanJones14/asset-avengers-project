package com.avengers.endgame.instrument;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

import java.util.UUID;

public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {
	Optional<Instrument> findBySymbol(String symbol);
}