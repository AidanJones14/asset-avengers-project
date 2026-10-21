package com.avengers.internal.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ClientPortfolioFilterTest {
    @Test void rejectsUnknownClassBeforeQuerying() {
        var jdbc=mock(NamedParameterJdbcTemplate.class);
        assertThrows(ResponseStatusException.class,()->new ClientDirectoryController(jdbc).portfolios("D",""));
        verifyNoInteractions(jdbc);
    }
    @Test void parameterizesAndEscapesNameWildcards() {
        var jdbc=mock(NamedParameterJdbcTemplate.class);
        new ClientDirectoryController(jdbc).portfolios("B"," Cam%_ ");
        verify(jdbc).query(contains("portfolio_class=:class"),
            eq(Map.of("class","B","pattern","%Cam\\%\\_%")),any(RowMapper.class));
    }
}
