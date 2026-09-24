package com.avengers.endgame.instrument;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "instruments")
public class Instrument {

    @Id
    @Column(name = "instrument_id")
    private UUID instrumentId;

    private String symbol;

    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "security_type")
    private SecurityType securityType;

    private String exchange;

    private String currency = "USD";

    private String isin;

    private boolean isActive = true;

    public UUID getInstrumentId() {
        return instrumentId;
    }

    public String getSymbol() {
        return symbol;
    }

    public String getName() {
        return name;
    }

    public SecurityType getSecurityType() {
        return securityType;
    }

    public String getExchange() {
        return exchange;
    }

    public String getCurrency() {
        return currency;
    }

    public String getIsin() {
        return isin;
    }

    public boolean isActive() {
        return isActive;
    }
}
