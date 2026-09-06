# Visual baseline tests

The visual suite renders the real `Game.vue` against deterministic local state from
`src/visual-fixtures/game-fixture.ts`. It does not add a production route, connect to
an application WebSocket, or send game actions.

Install the pinned Chromium browser once after `npm ci`:

```sh
npx playwright install-deps chromium
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
```

Run the committed baselines:

```sh
npm run test:visual
```

Only after reviewing an intentional visual change, update them with:

```sh
npm run test:visual:update
```

The standalone fixture is served by Vite at `visual-fixture.html`. Supported query
scenarios are `default`, `take-gems`, `purchase`, and `discard`.
