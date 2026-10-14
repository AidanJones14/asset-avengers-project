package com.avengers.endgame.instrument;

import org.springframework.data.jpa.repository.JpaRepository;

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
}