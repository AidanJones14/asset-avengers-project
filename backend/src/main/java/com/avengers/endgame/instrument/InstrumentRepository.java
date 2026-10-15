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

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(value = """
        INSERT INTO instruments (instrument_id, symbol, name, security_type, exchange, currency, is_active)
        VALUES (:id, :symbol, :symbol, 'equity', 'UNKNOWN', :currency, true)
        ON CONFLICT DO NOTHING
        """, nativeQuery = true)
    int insertIfAbsent(@org.springframework.data.repository.query.Param("id") UUID id,
                       @org.springframework.data.repository.query.Param("symbol") String symbol,
                       @org.springframework.data.repository.query.Param("currency") String currency);
	Optional<Instrument> findBySymbol(String symbol);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select i from Instrument i where i.instrumentId = :instrumentId")
	Optional<Instrument> findByIdForUpdate(@Param("instrumentId") UUID instrumentId);
}