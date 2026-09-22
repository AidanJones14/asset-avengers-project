# Asset Avengers client UI

Angular implementation of the Asset Avengers client prototypes:

- `/client/overview`: summary cards, interactive performance chart, market watch, and top holdings.
- `/client/portfolio`: all holdings and asset-specific trade entry.
- `/client/orders`: session order history and an empty state.

From this directory, run `npm install` (if dependencies are missing), then `npm start`. Open http://localhost:4200. Use `npm run build` for a production build and `npm test -- --watch=false` for tests.

New trade and each holding's Trade button open a keyboard-accessible native dialog. Buy/sell orders support review, editing, cancellation, quantity validation, buying-power validation, and holdings validation. Confirmed simulated orders update the shared portfolio store and order history across routes. Refreshing resets the demo. There is no backend integration or live order execution.

Design source: https://www.figma.com/design/FjP8vRiu8SvtS15xwqT9jQ?node-id=2-195 (Overview) and node 2:198 (Portfolio). Orders follows the saved interactive prototype because the Figma plan limit prevented retrieving node 2:199. The Chart.js canvas replaces the Figma chart image and offers hover tooltips, 1W/1M/3M/1Y ranges, and an accessible data table. Deterministic sample history is generated in `src/app/performance-data.ts`; the latest portfolio point follows the shared store. The benchmark is rebased to the portfolio opening value for each range. Historical data is illustrative, not live market data. Summary totals are calculated from the sample holdings rather than copying the inconsistent prototype totals. Only the Client role is implemented.

Component structure:

- `src/app/app.*`: root router outlet; `app.routes.ts` defines authentication routes and nested client routes.
- `src/app/client/layout/`: shared sidebar and account navigation, with scoped layout styles.
- `src/app/client/pages/`: separate Overview, Portfolio, and Orders pages that assemble components and bind store data.
- `src/app/client/components/`: portfolio summary, holdings table, market watch, order history, shared page frame, and trade dialog.
- `src/app/performance-chart.ts`: reusable interactive chart.
- `src/app/portfolio.store.ts`: shared portfolio state, validation, and trade rules.
- `src/styles.css`: shared design tokens, table/form styles, and responsive utilities.

Display components receive data through signal inputs and emit trade actions through outputs. PageFrame provides the shared heading, notification, and dialog orchestration. TradeDialog owns the form/review state and calls PortfolioStore; the store remains the single source of truth across routes. Auth pages are outside the client layout route.

Login and signup UI is available at /login and /signup; the root now opens login. These are explicitly labeled demo forms with email, required-field, minimum signup password length, and password confirmation validation. Credentials are never stored or transmitted, and no account is created or authenticated. Client routes remain publicly accessible for preview. Connect an authentication API before adding real account access or protected routes.
