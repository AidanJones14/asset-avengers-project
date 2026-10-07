## Testing the Backend with H2 In-Memory Database

### Start the Backend

From the backend folder, run:

```bash
mvnw.cmd spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=test"
```

You should see output ending with:
```
Started EndgameApplication in X seconds
```

The server will run on `http://localhost:8082`

---

### Test Data Available

The H2 database will auto-populate with:

#### Users (2)
- `user_id`: `550e8400-e29b-41d4-a716-446655440001` (John Doe)
- `user_id`: `550e8400-e29b-41d4-a716-446655440002` (Jane Smith)

#### Accounts (2)
- `account_id`: `550e8400-e29b-41d4-a716-446655440010` (John's account, $50,000 cash)
- `account_id`: `550e8400-e29b-41d4-a716-446655440011` (Jane's account, $75,000 cash)

#### Instruments (4)
- AAPL: `550e8400-e29b-41d4-a716-446655440100` (Apple, $313.53)
- GOOGL: `550e8400-e29b-41d4-a716-446655440101` (Alphabet, $140+)
- MSFT: `550e8400-e29b-41d4-a716-446655440102` (Microsoft, $300+)
- FX:EURUSD: `550e8400-e29b-41d4-a716-446655440103` (EUR/USD, $1.1675)

#### Holdings (existing positions)
- John owns 10 AAPL, 5 GOOGL
- Jane owns 20 MSFT

---

### Test API Requests in Bruno

#### 1. Get a Quote (Pricing API Test)

```
GET http://localhost:8082/api/v1/orders/quote/550e8400-e29b-41d4-a716-446655440100
```

**Expected response (200 OK):**
```json
{
  "symbol": "AAPL",
  "price": 313.53,
  "bid": 313.5,
  "ask": 313.56,
  "spreadBps": 1.8587,
  "currency": "USD",
  "change": 3.63,
  "changePercent": 1.1713,
  "previousClose": 309.9,
  "asOf": "2026-08-26T16:13:24Z",
  "marketState": "open",
  "stale": false,
  "source": "cache"
}
```

---

#### 2. Create a Buy Order (Market Order)

```
POST http://localhost:8082/api/v1/orders
Content-Type: application/json

{
  "accountId": "550e8400-e29b-41d4-a716-446655440010",
  "instrumentId": "550e8400-e29b-41d4-a716-446655440100",
  "orderType": "market",
  "orderSide": "buy",
  "quantity": 5,
  "limitPrice": null,
  "stopPrice": null
}
```

**Expected response (201 Created):**
```json
{
  "orderId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "accountId": "550e8400-e29b-41d4-a716-446655440010",
  "instrumentId": "550e8400-e29b-41d4-a716-446655440100",
  "orderType": "market",
  "orderSide": "buy",
  "quantity": 5,
  "price": null,
  "limitPrice": null,
  "stopPrice": null,
  "status": "submitted",
  "submittedAt": "2026-10-07T...",
  "updatedAt": "2026-10-07T..."
}
```

---

#### 3. Create a Limit Buy Order

```
POST http://localhost:8082/api/v1/orders
Content-Type: application/json

{
  "accountId": "550e8400-e29b-41d4-a716-446655440010",
  "instrumentId": "550e8400-e29b-41d4-a716-446655440101",
  "orderType": "limit",
  "orderSide": "buy",
  "quantity": 3,
  "limitPrice": 140.00,
  "stopPrice": null
}
```

---

#### 4. Create a Stop Order (Sell)

```
POST http://localhost:8082/api/v1/orders
Content-Type: application/json

{
  "accountId": "550e8400-e29b-41d4-a716-446655440010",
  "instrumentId": "550e8400-e29b-41d4-a716-446655440100",
  "orderType": "stop",
  "orderSide": "sell",
  "quantity": 2,
  "limitPrice": null,
  "stopPrice": 300.00
}
```

---

#### 5. Get All Orders

```
GET http://localhost:8082/api/v1/orders
```

---

#### 6. Get a Specific Order

```
GET http://localhost:8082/api/v1/orders/{orderId}
```

Replace `{orderId}` with the ID from a previous response.

---

### H2 Console (Optional)

You can also inspect the database at:

```
http://localhost:8082/h2-console
```

- JDBC URL: `jdbc:h2:mem:testdb`
- Username: `sa`
- Password: (leave blank)

Click **Connect** to browse all tables and data.

---

### Troubleshooting

**Backend won't start?**
- Check Java version: `java -version` (needs Java 25+)
- Check port 8082 isn't in use: restart or change `server.port` in `application-test.properties`

**Quote endpoint returns 502?**
- Check `FAUXNANCE_KEY` is in `.env` file
- Verify internet connection (need to reach AWS API)

**Order creation fails with validation error?**
- Check account/instrument IDs exist (use the IDs from this guide)
- Verify `orderType` is one of: `market`, `limit`, `stop`, `stop_limit`
- For `limit` orders, `limitPrice` must be > 0
- For `stop` orders, `stopPrice` must be > 0

---

### Next Steps

1. Start the backend with the test profile
2. Test the quote endpoint (should hit Fauxnance API)
3. Create a few test orders
4. Check the H2 console to see data persisting
5. Build out order fill logic next

