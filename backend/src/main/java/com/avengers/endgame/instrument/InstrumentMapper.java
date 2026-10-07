package com.avengers.endgame.instrument;

import org.springframework.stereotype.Component;

@Component
public class InstrumentMapper {

    public Instrument toEntity(CreateInstrumentRequestDto dto) {
        Instrument instrument = new Instrument();
        instrument.setSymbol(dto.symbol());
        instrument.setName(dto.name());
        instrument.setSecurityType(dto.securityType());
        instrument.setExchange(dto.exchange());
        instrument.setCurrency(dto.currency() == null || dto.currency().isBlank() ? "USD" : dto.currency());
        instrument.setIsin(dto.isin());
        instrument.setActive(dto.isActive() == null || dto.isActive());
        return instrument;
    }

    public InstrumentResponseDto toResponse(Instrument instrument) {
        return new InstrumentResponseDto(
                instrument.getInstrumentId(),
                instrument.getSymbol(),
                instrument.getName(),
                instrument.getSecurityType(),
                instrument.getExchange(),
                instrument.getCurrency(),
                instrument.getIsin(),
                instrument.isActive()
        );
    }
}

