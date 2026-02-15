# Combat RNG and Soft Zone of Control Update

This document describes the two gameplay updates that were implemented:

1. **Combat RNG (±20%)** on attacks and counter-attacks.
2. **Soft Zone of Control (ZoC)** movement pressure (extra movement cost, no hard stop).

## 1) Combat RNG (±20%)

### What changed
- Added deterministic combat variance to damage resolution.
- Each attack and counter-attack now applies a multiplier in the `[0.8, 1.2]` range.
- The roll is applied **after** base attack modifiers (terrain bonuses/penalties, wounds, morale) and **before** terrain defense subtraction.
- Final damage still enforces a minimum of `1`.

### Determinism and fairness
- RNG uses a deterministic linear-congruential generator (LCG) with an internal `rngState` in game state.
- This avoids cross-client desync and keeps results reproducible for identical action sequences.

### Logging updates
- Combat logs now include the RNG result as a percentage, for example `RNG +12%` or `RNG -8%`.
- This was added for regular attacks, counter-attacks, and wall damage (`attackTerrain`).

## 2) Damage Prediction Revision

### What changed
- Damage previews were updated from single-value predictions to a **range**:
  - Attack preview displays `min~max`.
  - Counter preview displays `min~max` when applicable.
- If range metadata is not present (legacy state), UI gracefully falls back to the old single number format.

### Why this matters
- Since combat has variance now, a single deterministic prediction would be misleading.
- Range previews improve player decision quality and reduce surprise.

## 3) Soft Zone of Control (ZoC)

### Rule implemented
- Enemy units project a soft control zone around adjacent hexes.
- Entering an enemy-ZoC hex applies the surcharge only when the unit is already in an enemy-ZoC hex (ZoC-to-ZoC movement).
- Surcharge is currently **`+0.5` move points**.

### Design details
- This is intentionally **soft** ZoC: movement is not blocked outright, and approaching from outside ZoC is not penalized.
- If a unit has enough movement points, it can still move through threatened spaces.
- ZoC is integrated into:
  - Reachability checks (highlighted/allowed moves)
  - Actual movement path cost computation when moving

### Current exclusions
- Enemy transports do not project ZoC pressure.

## 4) Files updated

### Core gameplay and combat
- `game/GameLogic.js`
  - Added damage variance constants/helpers.
  - Added deterministic RNG stream (`rngState`).
  - Added damage range helper for previews/tests.
  - Updated attack/counter/wall damage to use RNG.
  - Added soft ZoC surcharge in reachable-hex and path-cost logic.

### Server HTTP action path parity
- `app/api/action/route.js`
  - Mirrored RNG and soft ZoC updates for API-driven multiplayer flow.
  - Added RNG details to combat and wall-damage logs.

### UI prediction updates
- `components/GameBoard.js`
  - Updated damage text rendering to show `min~max` ranges.
- `app/page.js`
  - Updated local preview computation to generate min/max ranges.
- `app/http-multiplayer/page.js`
  - Updated preview computation to generate min/max ranges.
- `app/multiplayer/page.js`
  - Updated boardgame.io preview computation to generate min/max ranges.

### State initialization
- `lib/gameState.js`
  - Added `rngState` initialization for newly created HTTP games.

### Tests
- `tests/unit.test.mjs`
  - Updated deterministic-damage tests to assert range bounds.
  - Added deterministic RNG reproducibility test (same seed => same results).
  - Added soft ZoC movement-cost behavior test.

## 5) Tuning knobs

You can tweak these constants for balance:
- Combat variance: in `game/GameLogic.js` / `app/api/action/route.js`
  - `DAMAGE_VARIANCE.min` and `DAMAGE_VARIANCE.max`
- Soft ZoC pressure:
  - `SOFT_ZOC_MOVE_PENALTY`

## 6) Backwards compatibility notes

- UI still supports legacy single-value damage preview objects.
- RNG state defaults to a safe seed if absent.

## 7) Suggested playtest checklist

1. Verify both low and high rolls are visible in combat logs.
2. Validate preview range aligns with observed outcomes over repeated attacks.
3. Check movement highlighting differs when stepping into enemy ZoC.
4. Ensure units can still traverse ZoC hexes when move points are sufficient.
5. Compare boardgame.io and HTTP multiplayer behavior for parity.
