package com.avengers.endgame.instrument;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

import java.util.UUID;

@Entity
public class Instrument {

    @Id
    private UUID instrumentId;

    private String symbol;

    private String name;

    private SecurityType securityType;

    private String exchange;

    private String currency = "USD";

    private String isin;

    private boolean isActive = true;
}
