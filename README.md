# Emergent Game

A turn-based hex strategy game built with **Next.js** and an HTTP multiplayer backend.

---

## Current project status

The actively supported experience is HTTP multiplayer with:
- 1v1 and 2v2 team play
- setup + battle phases
- retreat system, terrain effects, morale, and objective maps
- lobby management (leader, spectators, waitlist, slot claiming)
- optional AI-controlled players

Primary play URL in local dev:
- `http://localhost:3000/http-multiplayer`

---

## Quick start

```bash
npm install
npm run dev
```

Then open:
- `http://localhost:3000/http-multiplayer`

Run tests:

```bash
npm test
```

---

## AI state of the game (important)

This is the practical state of AI support right now.

### What AI does well today

- AI can be added by the lobby leader into empty slots.
- AI can participate in setup and battle phases.
- AI can chain actions automatically after player/API actions.
- AI supports mixed lobbies (humans + AI).
- AI can run full AI-vs-AI matches.
- AI stops when game-over is reached.

### AI tactical model (high level)

During **setup**, AI:
- builds a roster from configured unit counts/composition
- picks legal deploy tiles from game rules
- prefers stronger terrain when placing
- readies up once deployment is complete

During **battle**, AI:
- prioritizes high-value attacks first
- evaluates movement pressure/support before moving
- can choose safer positioning over blind aggression
- uses retreat when conditions allow

### AI configuration available in lobby

Leader can configure:
- target deployment unit count (`1..20`)
- exact per-type composition (including `WAR_GALLEY`)

### Important constraints

- AI still has simpler strategic planning than a deep-search bot.
- Behavior is heuristic-driven and intentionally lightweight.
- Fog-of-war behavior exists in code paths but is not equivalent to a dedicated partial-information planning AI.

If you want stronger AI, best next work items are:
- better objective-aware planning
- stronger team coordination in 2v2
- deeper lookahead for combat trades
- difficulty tiers / personalities

---

## Gameplay rules snapshot

- **Setup phase**: players place units in spawn zones, then ready up.
- **Battle phase**: turn-based movement/attacks begin after all eligible players are ready.
- Players with no deployed units are treated as inactive combatants.
- Win conditions depend on mode:
  - elimination
  - objective modes (including map-specific objective systems)
  - turn-limit tiebreakers

---

## Key directories

- `app/` – Next.js app routes/UI
- `app/api/action/route.js` – authoritative HTTP action engine + AI loop
- `game/` – core game rules, movement/combat logic, map systems
- `components/` – game UI components
- `lib/` – utilities, state, timers, sanitization
- `tests/` – unit tests

---

## Notes for contributors

- Prefer adding/adjusting unit tests in `tests/unit.test.mjs` for rule changes.
- Keep lobby/action payloads sanitized through `lib/inputSanitization.js`.
- Preserve deterministic-safe server-side rule checks in `app/api/action/route.js` and `game/GameLogic.js`.
