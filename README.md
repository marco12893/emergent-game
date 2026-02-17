# Emergent Game — HTTP Multiplayer + AI Commanders

This project is a turn-based hex strategy game built with Next.js and an HTTP API backend.

## What was added in this update

Party leaders can now fill empty player slots with **AI commanders** in the lobby.

### Supported right now
- ✅ AI for **non fog-of-war matches**.
- ✅ Multiple AI players in the same match (including **AI vs AI** if all slots are AI).
- ✅ AI automatically stops when the game is over (win/loss/draw), including chained AI turns.

### Not supported yet
- ❌ Fog-of-war AI behavior (intentionally disabled for now).

---

## Quick start

```bash
npm run dev
```

Open:
- `http://localhost:3000/http-multiplayer`

---

## How to use AI in a lobby

1. Create or join a lobby.
2. Ensure **Fog of war = Disabled**.
3. If you are the lobby leader, click **+AI** on any empty team slot.
4. Start match as usual.

Notes:
- Only lobby leader can add AI.
- AI can be mixed with human players.
- You can fill both sides with AI and watch an AI-only match.

---

## AI design overview

The AI is intentionally lightweight and deterministic-ish (with RNG still from combat variance).

### 1) Scope gating
The AI will only generate actions when:
- the unit owner in the active slot is marked `isAI: true`,
- the game is not over,
- fog-of-war is disabled,
- and it is that AI player’s turn (setup and battle).

### 2) Turn loop model
After each normal player action request, the server runs an **AI continuation loop**:
- while current turn belongs to an AI,
- compute a best action,
- apply action,
- check win/loss,
- continue until no valid AI action remains or a safety cap is hit.

This allows:
- AI chaining multiple actions in one turn,
- seamless AI-vs-AI progression,
- and immediate stop at game over.

### 3) Setup-phase heuristics
In setup phase, AI uses:
- Target roster with basic composition rules:
  - up to 2 Knights,
  - up to 2 Archers,
  - up to 1 Catapult,
  - then infantry fallback.
- Deployable-hex search from existing game rules (`getDeployableHexes`).
- Terrain-priority placement:
  - prefers `HILLS`, `FOREST`, defensive city-like terrain,
  - then lower-value tiles.
- When enough units are placed (or no valid placement), AI sends `readyForBattle`.

### 4) Battle-phase heuristics
Battle action priority is:
1. **Best attack available now**
   - score favors: kill potential, low-HP targets, and dangerous enemy units.
2. **Otherwise evaluate stance (push / hold / fall back)**
   - AI estimates local ally-vs-enemy power around each unit.
   - when outmatched and wounded, it prefers to hold safer terrain or move away instead of charging.
3. **Retreat when appropriate**
   - once retreat is unlocked for the map, severely threatened low-HP units in retreat zones can retreat.
4. **Otherwise end turn**.

### 5) Combat handling
AI combat uses the same core combat mechanics as regular actions:
- terrain defense,
- morale modifiers,
- HP-based damage scaling,
- variance RNG,
- counter-attack behavior,
- unit death cleanup and morale recalculation.

### 6) Safety + stop conditions
The AI loop includes:
- immediate stop when `game.gameOver` exists,
- max-iteration cap per request to avoid runaway loops.

---

## API behavior changes

### New action: `addAiPlayer`
Lobby leader can call:

```json
{
  "action": "addAiPlayer",
  "payload": {
    "playerID": "<leader-id>",
    "desiredSlot": "0|1|2|3"
  }
}
```

Validation rules:
- lobby phase only,
- leader only,
- target slot must be empty and valid,
- fog-of-war must be disabled.

---

## Frontend behavior changes

In the multiplayer lobby:
- Empty slot now shows **+AI** button (leader only, non-fog).
- AI occupants display `(AI)` tag.
- Helper text indicates AI currently supports non-fog matches.
- Available in both lobby UIs (`/` and `/http-multiplayer`) used for Vercel multiplayer play.

---

## Development notes

### Key files touched
- `app/api/action/route.js` — AI registration + decision engine + execution loop.
- `app/http-multiplayer/page.js` — lobby controls for adding AI and AI slot badges.
- `lib/inputSanitization.js` — allow new action `addAiPlayer`.
- `tests/unit.test.mjs` — sanitizer coverage for `addAiPlayer`.

---

## Testing

Run:

```bash
npm test
```

---

## Future improvements (recommended)

- Fog-of-war aware AI (partial observability + scouting model).
- Better strategic planning:
  - objective-aware map behavior,
  - threat maps,
  - tactical retreat thresholds,
  - deeper lookahead.
- Distinct AI personalities/difficulties.
- Time-budgeted search (beam search / minimax-lite for local fights).


## Recent AI Lobby Changes (Codex)

- Fixed leader reassignment when a slot player (e.g. Player 0) moves to spectator/waitlist: leaders now retain participant identity instead of staying tied to the numeric slot.
- AI setup is automatic again (leaders no longer place AI units on the map directly).
- Added AI card **Settings** popup in lobby for leader-controlled AI composition.
- Added support for configuring exact AI unit counts by type (`SWORDSMAN`, `ARCHER`, `KNIGHT`, `MILITIA`, `CATAPULT`) with total constrained to 1–20.
- Added new action `setAiDeploymentComposition` and validation/sanitization support.
- Kept one-AI-per-lobby enforcement and fog-compatible AI behavior from prior updates.
