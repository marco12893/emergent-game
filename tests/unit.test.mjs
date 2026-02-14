import test from 'node:test'
import assert from 'node:assert/strict'
import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js'
import { cn } from '../lib/utils.js'
import {
  sanitizeAction,
  sanitizeChatMessage,
  sanitizeCoordinate,
  sanitizeGameId,
  sanitizeMapId,
  sanitizePlayerID,
  sanitizePlayerName,
  sanitizeTeamModeFlag,
  sanitizeUnitId,
  sanitizeUnitType,
  sanitizeWinterFlag,
  validatePayload,
} from '../lib/inputSanitization.js'
import {
  DEFAULT_MAP_ID,
  MAPS,
  generateMapData,
  getMapConfig,
} from '../game/maps.js'
import {
  areAllies,
  getPlayerColor,
  getTeamId,
  getTeamLabel,
  getTeamPlayOrder,
  getUnitSpriteProps,
  PLAYER_COLORS,
  TEAM_IDS,
} from '../game/teamUtils.js'
import {
  getUnitActionRingImage,
  shouldShowUnitActionRing,
} from '../game/unitActionIndicators.js'
import {
  createUnit,
  getAttackableHexes,
  getDeployableHexes,
  getHexesInRange,
  getNeighbors,
  getReachableHexes,
  getUnitVisionRange,
  getVisibleHexesForPlayer,
  getVisibleUnitsForPlayer,
  shouldEmitDamageOnRemoval,
  getRetreatActivationTurn,
  getRetreatZoneForPlayer,
  hexDistance,
  isHexOccupied,
  isInSpawnZone,
  getUnitAtHex,
  MedievalBattleGame,
  TERRAIN_TYPES,
  UNIT_TYPES,
} from '../game/GameLogic.js'
import { sanitizeCustomMap } from '../lib/customMap.js'
import {
  createMap4ObjectiveState,
  getMap4VictoryInfo,
  updateMap4ObjectiveState,
} from '../game/map4Objectives.js'

const makeHexGrid = (radius) => {
  const hexes = []
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
        hexes.push({ q, r, s })
      }
    }
  }
  return hexes
}

const makeTerrainMap = (hexes, overrides = {}) => {
  const terrainMap = {}
  hexes.forEach((hex) => {
    terrainMap[`${hex.q},${hex.r}`] = 'PLAIN'
  })
  Object.entries(overrides).forEach(([key, value]) => {
    terrainMap[key] = value
  })
  return terrainMap
}

test('lib/utils cn merges class names and trims falsy values', () => {
  assert.equal(cn('btn', undefined, 'btn-primary'), 'btn btn-primary')
  assert.equal(cn('p-2', false && 'hidden', 'p-4'), 'p-4')
})

test('sanitizeGameId enforces 4-character uppercase lobby codes', () => {
  assert.equal(sanitizeGameId('abcd'), 'ABCD')
  assert.equal(sanitizeGameId('ab-cd'), 'ABCD')
  assert.equal(sanitizeGameId('ab1d'), '')
  assert.equal(sanitizeGameId('abc'), '')
})

test('sanitizePlayerID only accepts allowed values', () => {
  assert.equal(sanitizePlayerID('0'), '0')
  assert.equal(sanitizePlayerID('3'), '3')
  assert.equal(sanitizePlayerID('spectator'), 'spectator')
  assert.equal(sanitizePlayerID('5'), null)
})

test('sanitizePlayerName strips invalid chars and length', () => {
  assert.equal(sanitizePlayerName('Alice'), 'Alice')
  assert.equal(sanitizePlayerName(' Bob <script> '), 'Bob script')
  assert.equal(sanitizePlayerName('a'.repeat(60)).length, 24)
})

test('sanitizeUnitId allows only alphanumeric', () => {
  assert.equal(sanitizeUnitId('abc123'), 'abc123')
  assert.equal(sanitizeUnitId('abc-123'), 'abc123')
})

test('sanitizeUnitType validates allowed types', () => {
  assert.equal(sanitizeUnitType('SWORDSMAN'), 'SWORDSMAN')
  assert.equal(sanitizeUnitType('war_galley'), 'WAR_GALLEY')
  assert.equal(sanitizeUnitType('invalid'), null)
})

test('sanitizeCoordinate enforces numeric bounds', () => {
  assert.equal(sanitizeCoordinate('5'), 5)
  assert.equal(sanitizeCoordinate(0), 0)
  assert.equal(sanitizeCoordinate(200), null)
  assert.equal(sanitizeCoordinate('abc'), null)
})

test('sanitizeAction validates allowed action names', () => {
  assert.equal(sanitizeAction('placeUnit'), 'placeUnit')
  assert.equal(sanitizeAction('attackUnit'), 'attackUnit')
  assert.equal(sanitizeAction('setFogOfWar'), 'setFogOfWar')
  assert.equal(sanitizeAction('invalidAction'), null)
})

test('sanitizeChatMessage strips control chars and HTML', () => {
  assert.equal(sanitizeChatMessage('hello'), 'hello')
  assert.equal(sanitizeChatMessage('hey<>there'), 'heythere')
  assert.equal(sanitizeChatMessage('a'.repeat(200)).length, 120)
})

test('sanitizeMapId validates map identifiers', () => {
  assert.equal(sanitizeMapId('map_1'), 'MAP_1')
  assert.equal(sanitizeMapId('custom'), 'CUSTOM')
  assert.equal(sanitizeMapId('MAP_4'), 'MAP_4')
})



test('sanitizeCustomMap allows map-4-sized imports', () => {
  const sanitized = sanitizeCustomMap({
    size: { width: 13, height: 5 },
    terrainMap: {},
    deploymentZones: { blue: [], red: [] },
  })
  assert.ok(sanitized)
  assert.equal(sanitized.size.width, 13)
  assert.equal(sanitized.size.height, 5)
})

test('generateMapData loads static MAP_4 data and deployment zones', () => {
  const map = generateMapData('MAP_4')
  assert.equal(map.mapConfig.id, 'MAP_4')
  assert.equal(map.terrainMap['-7,-4'], 'CASTLE')
  assert.ok((map.deploymentZones?.blue || []).length > 0)
  assert.ok((map.deploymentZones?.red || []).length > 0)
})



test('MAP_4 has no plain grass tile override that breaks winter visuals', () => {
  const map = generateMapData('MAP_4')
  const hasGrassOverride = Object.values(map.tileMap || {}).some((path) => path === '/tiles/Grass_5.png')
  assert.equal(hasGrassOverride, false)
})
test('map 4 objective capture is paused by contest and resumes without reset', () => {
  const G = {
    units: [{ id: 'r1', ownerID: '1', q: 0, r: 0, currentHP: 100 }],
    log: [],
    map4ObjectiveState: createMap4ObjectiveState({ terrainMap: { '0,0': 'CASTLE' }, teamMode: false }),
  }

  updateMap4ObjectiveState({ G, teamMode: false })
  updateMap4ObjectiveState({ G, teamMode: false })
  assert.equal(G.map4ObjectiveState.buildings.CASTLE.captureProgress['1'], 2)

  G.units.push({ id: 'b1', ownerID: '0', q: 0, r: 0, currentHP: 100 })
  updateMap4ObjectiveState({ G, teamMode: false })
  assert.equal(G.map4ObjectiveState.buildings.CASTLE.captureProgress['1'], 2)

  G.units = G.units.filter((u) => u.ownerID !== '0')
  updateMap4ObjectiveState({ G, teamMode: false })
  assert.equal(G.map4ObjectiveState.buildings.CASTLE.captureProgress['1'], 3)
  updateMap4ObjectiveState({ G, teamMode: false })
  assert.equal(G.map4ObjectiveState.buildings.CASTLE.owner, '1')
})

test('map 4 defender wins at turn 40 when holding at least one objective', () => {
  const G = {
    units: [{ id: 'b1', ownerID: '0', q: 0, r: 0, currentHP: 100 }],
    map4ObjectiveState: createMap4ObjectiveState({ terrainMap: { '0,0': 'CASTLE' }, teamMode: false }),
  }

  const victory = getMap4VictoryInfo({ G, teamMode: false, turn: 40 })
  assert.equal(victory?.winner, '0')
  assert.equal(victory?.victoryType, 'objective_defense')
})
test('sanitizeWinterFlag and teamMode flag parse booleans', () => {
  assert.equal(sanitizeWinterFlag(true), true)
  assert.equal(sanitizeWinterFlag('true'), true)
  assert.equal(sanitizeWinterFlag(false), false)
  assert.equal(sanitizeTeamModeFlag(true), true)
  assert.equal(sanitizeTeamModeFlag('true'), true)
  assert.equal(sanitizeTeamModeFlag(false), false)
})

test('validatePayload sanitizes values and reports errors', () => {
  const schema = {
    playerID: { required: true, sanitize: sanitizePlayerID },
    unitType: { required: true, sanitize: sanitizeUnitType },
    optional: { required: false, sanitize: sanitizePlayerName },
  }
  const result = validatePayload(
    { playerID: '0', unitType: 'archer', optional: 'Bob' },
    schema
  )
  assert.equal(result.error, undefined)
  assert.deepEqual(result.sanitized, {
    playerID: '0',
    unitType: 'ARCHER',
    optional: 'Bob',
  })

  const invalid = validatePayload({ playerID: '5', unitType: 'archer' }, schema)
  assert.ok(invalid.error.includes('Invalid value for field: playerID'))
})


test('getMapConfig falls back to default map', () => {
  assert.equal(getMapConfig('MAP_1').id, 'MAP_1')
  assert.equal(getMapConfig('missing').id, DEFAULT_MAP_ID)
})

test('generateMapData returns map config, hexes, and terrain', () => {
  const data = generateMapData('MAP_1')
  assert.equal(data.mapConfig.id, 'MAP_1')
  assert.equal(Array.isArray(data.hexes), true)
  assert.ok(Object.keys(data.terrainMap).length > 0)
})


test('sanitizeCustomMap normalizes size, terrain, tiles, and deployment zones', () => {
  const custom = sanitizeCustomMap({
    name: '  My Custom   ',
    size: { width: 4, height: 3 },
    terrainMap: {
      '0,0': 'FOREST',
      '1,1': 'MOUNTAIN',
      '999,999': 'WATER',
      '0,1': 'INVALID',
      '0,2': 'CITY',
    },
    tileMap: {
      '0,0': '/tiles/Forest.png',
      '1,1': '/tiles/Hills.png',
      '2,2': 'https://evil.example/tile.png',
    },
    deploymentZones: {
      blue: [{ q: -4, r: 0 }, { q: -4, r: 0 }, { q: 999, r: 999 }],
      red: [{ q: 4, r: 0 }],
    },
  })

  assert.equal(custom.id, 'CUSTOM')
  assert.equal(custom.name, 'My Custom')
  assert.equal(custom.size.width, 4)
  assert.equal(custom.size.height, 3)
  assert.equal(custom.terrainMap['0,0'], 'FOREST')
  assert.equal(TERRAIN_TYPES.CITY.defenseBonus, 5)
  assert.equal(TERRAIN_TYPES.CITY.moveCost, 1)
  assert.equal(custom.terrainMap['0,1'], 'PLAIN')
  assert.equal(custom.terrainMap['0,2'], 'CITY')
  assert.equal(custom.tileMap['0,0'], '/tiles/Forest.png')
  assert.equal(custom.tileMap['2,2'], undefined)
  assert.equal(custom.deploymentZones.blue.length, 1)
  assert.deepEqual(custom.deploymentZones.red, [{ q: 4, r: 0 }])
})

test('sanitizeCustomMap rejects invalid sizes', () => {
  assert.equal(sanitizeCustomMap(null), null)
  assert.equal(sanitizeCustomMap({ size: { width: 2, height: 4 } }), null)
  assert.equal(sanitizeCustomMap({ size: { width: 6, height: 20 } }), null)
})

test('MAPS exposes known map ids', () => {
  assert.deepEqual(Object.keys(MAPS), ['MAP_1', 'MAP_2', 'MAP_3', 'MAP_4'])
})

test('player colors and team ids', () => {
  assert.equal(PLAYER_COLORS['0'], 'blue')
  assert.equal(getPlayerColor('1'), 'red')
  assert.equal(getPlayerColor('unknown'), 'blue')
  assert.equal(TEAM_IDS['2'], 'blue-green')
  assert.equal(getTeamId('3'), 'red-yellow')
})

test('areAllies handles undefined and allied ids', () => {
  assert.equal(areAllies('0', '2'), true)
  assert.equal(areAllies('0', '1'), false)
  assert.equal(areAllies(undefined, '1'), false)
})

test('getTeamPlayOrder trims to num players', () => {
  assert.deepEqual(getTeamPlayOrder(2), ['0', '1'])
  assert.deepEqual(getTeamPlayOrder(4), ['0', '2', '1', '3'])
})

test('getTeamLabel and getUnitSpriteProps', () => {
  assert.equal(getTeamLabel('blue-green'), 'Blue & Green')
  assert.equal(getTeamLabel('unknown'), 'Unknown Team')
  const sprite = getUnitSpriteProps({ image: 'archer' }, '1')
  assert.equal(sprite.src, '/units/archer_red.png')
})

test('createUnit sets derived fields', () => {
  const unit = createUnit('SWORDSMAN', '0', 1, -1)
  assert.equal(typeof unit.id, 'string')
  assert.equal(unit.type, 'SWORDSMAN')
  assert.equal(unit.baseType, 'SWORDSMAN')
  assert.equal(unit.ownerID, '0')
  assert.equal(unit.s, 0)
  assert.equal(unit.hasMoved, false)
  assert.equal(unit.hasAttacked, false)
})

test('hexDistance is symmetric and uses cube coords', () => {
  const a = { q: 0, r: 0, s: 0 }
  const b = { q: 2, r: -1, s: -1 }
  assert.equal(hexDistance(a, b), 2)
  assert.equal(hexDistance(b, a), 2)
})

test('getHexesInRange excludes center and matches range', () => {
  const hexes = makeHexGrid(2)
  const center = { q: 0, r: 0, s: 0 }
  const inRange = getHexesInRange(center, 1, hexes)
  assert.equal(inRange.length, 6)
  assert.ok(inRange.every((hex) => hexDistance(center, hex) === 1))
})

test('getNeighbors filters to existing hexes', () => {
  const hexes = makeHexGrid(1)
  const neighbors = getNeighbors({ q: 0, r: 0, s: 0 }, hexes)
  assert.equal(neighbors.length, 6)
  const edgeNeighbors = getNeighbors({ q: 1, r: 0, s: -1 }, hexes)
  assert.ok(edgeNeighbors.length < 6)
})

test('isHexOccupied and getUnitAtHex require living units', () => {
  const unit = createUnit('ARCHER', '0', 0, 0)
  unit.currentHP = 0
  assert.equal(isHexOccupied(0, 0, [unit]), false)
  assert.equal(getUnitAtHex(0, 0, [unit]), undefined)
})

test('isInSpawnZone honors team mode and custom deployment zones', () => {
  assert.equal(isInSpawnZone(-4, 0, '0', 6, false), true)
  assert.equal(isInSpawnZone(4, 0, '1', 6, false), true)
  assert.equal(isInSpawnZone(-4, 0, '1', 6, false), false)
  assert.equal(isInSpawnZone(-4, 0, '0', 6, true), true)
  assert.equal(isInSpawnZone(4, 0, '1', 6, true), true)

  const deploymentZones = {
    blue: [{ q: 0, r: 0 }],
    red: [{ q: 1, r: 0 }],
  }

  assert.equal(isInSpawnZone(0, 0, '0', 6, false, deploymentZones), true)
  assert.equal(isInSpawnZone(1, 0, '1', 6, false, deploymentZones), true)
  assert.equal(isInSpawnZone(-4, 0, '0', 6, false, deploymentZones), false)
})

test('getDeployableHexes respects occupancy and terrain', () => {
  const hexes = makeHexGrid(1)
  const units = [createUnit('SWORDSMAN', '0', -1, 0)]
  const terrainMap = makeTerrainMap(hexes, {
    '-1,0': 'PLAIN',
    '0,0': 'WATER',
  })

  const deployable = getDeployableHexes({
    unitType: 'SWORDSMAN',
    hexes,
    units,
    terrainMap,
    playerID: '0',
    mapWidth: 2,
    teamMode: false,
  })
  assert.equal(
    deployable.some((hex) => hex.q === -1 && hex.r === 0),
    false
  )

  const navalDeployable = getDeployableHexes({
    unitType: 'WAR_GALLEY',
    hexes,
    units: [],
    terrainMap,
    playerID: '0',
    mapWidth: 2,
    teamMode: false,
  })
  assert.ok(
    navalDeployable.every(
      (hex) => terrainMap[`${hex.q},${hex.r}`] === 'WATER'
    )
  )
})

test('getReachableHexes blocks impassable and occupied tiles', () => {
  const hexes = makeHexGrid(2)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'MOUNTAIN',
    '0,1': 'FOREST',
  })
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const blocking = createUnit('MILITIA', '1', 0, 1)
  const reachable = getReachableHexes(unit, hexes, [blocking], terrainMap)
  assert.equal(
    reachable.some((hex) => hex.q === 1 && hex.r === 0),
    false
  )
  assert.equal(
    reachable.some((hex) => hex.q === 0 && hex.r === 1),
    false
  )
})

test('getReachableHexes allows naval on water', () => {
  const hexes = makeHexGrid(2)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'WATER',
  })
  const unit = createUnit('WAR_GALLEY', '0', 0, 0)
  const reachable = getReachableHexes(unit, hexes, [], terrainMap)
  assert.equal(
    reachable.some((hex) => hex.q === 1 && hex.r === 0),
    true
  )
})

test('getAttackableHexes respects team mode', () => {
  const hexes = makeHexGrid(2)
  const attacker = createUnit('ARCHER', '0', 0, 0)
  const enemy = createUnit('SWORDSMAN', '1', 1, -1)
  const ally = createUnit('SWORDSMAN', '2', 1, -1)
  const targets = getAttackableHexes(attacker, hexes, [enemy], {
    teamMode: false,
  })
  assert.equal(targets.length, 1)

  const teamTargets = getAttackableHexes(attacker, hexes, [ally], {
    teamMode: true,
  })
  assert.equal(teamTargets.length, 0)
})

test('MedievalBattleGame setup initializes game state with defaults', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'] }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  assert.equal(game.gameMode, 'ELIMINATION')
  assert.equal(game.mapId, DEFAULT_MAP_ID)
  assert.deepEqual(game.units, [])
  assert.deepEqual(game.playersReady, { '0': false, '1': false })
  assert.equal(game.objectiveControl[game.attackerId], 0)
})

test('MedievalBattleGame setup honors team mode and map overrides', () => {
  const ctx = { numPlayers: 4, playOrder: ['0', '1', '2', '3'] }
  const game = MedievalBattleGame.setup({
    ctx,
    setupData: { teamMode: true, mapId: 'MAP_2' },
  })
  assert.equal(game.teamMode, true)
  assert.equal(game.mapId, 'MAP_2')
  assert.equal(game.attackerId, 'blue-green')
  assert.equal(game.defenderId, 'red-yellow')
})

test('getHexesInRange returns empty for zero range', () => {
  const hexes = makeHexGrid(2)
  const center = { q: 0, r: 0, s: 0 }
  assert.deepEqual(getHexesInRange(center, 0, hexes), [])
})

test('getNeighbors returns no neighbors for isolated hex', () => {
  const lone = [{ q: 0, r: 0, s: 0 }]
  assert.deepEqual(getNeighbors(lone[0], lone), [])
})

test('getDeployableHexes returns empty for unknown unit type', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes)
  const deployable = getDeployableHexes({
    unitType: 'UNKNOWN',
    hexes,
    units: [],
    terrainMap,
    playerID: '0',
    mapWidth: 2,
    teamMode: false,
  })
  assert.deepEqual(deployable, [])
})

test('sanitizeAction rejects strings with symbols', () => {
  assert.equal(sanitizeAction('placeUnit!'), 'placeUnit')
  assert.equal(sanitizeAction('moveUnit '), 'moveUnit')
})

test('sanitizePlayerName collapses whitespace', () => {
  assert.equal(sanitizePlayerName('  Alice   Bob  '), 'Alice   Bob')
})

test('chat payload validation enforces required fields and sanitization', () => {
  const schema = {
    message: { required: true, sanitize: sanitizeChatMessage },
    playerID: { required: true, sanitize: sanitizePlayerID },
    playerName: { required: false, sanitize: sanitizePlayerName },
  }

  const valid = validatePayload(
    { message: ' Hello <b>World</b> ', playerID: '0', playerName: ' Alice ' },
    schema
  )
  assert.equal(valid.error, undefined)
  assert.deepEqual(valid.sanitized, {
    message: 'Hello bWorld/b',
    playerID: '0',
    playerName: 'Alice',
  })

  const emptyMessage = validatePayload({ message: '', playerID: '0' }, schema)
  assert.equal(emptyMessage.error, undefined)
  assert.equal(emptyMessage.sanitized.message, '')
})

test('battle move stores lastMove and undo restores previous state', () => {
  const hexes = makeHexGrid(2)
  const terrainMap = makeTerrainMap(hexes)
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const G = { hexes, units: [unit], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )

  assert.equal(unit.lastMove.q, 0)
  assert.equal(unit.lastMove.r, 0)
  assert.equal(Math.abs(unit.lastMove.s), 0)
  assert.equal(unit.lastMove.movePoints, 2)
  assert.equal(unit.lastMove.hasMoved, false)

  MedievalBattleGame.phases.battle.moves.undoMove(
    { G, ctx: {}, playerID: '0' },
    unit.id
  )

  assert.equal(unit.q, 0)
  assert.equal(unit.r, 0)
  assert.equal(Math.abs(unit.s), 0)
  assert.equal(unit.movePoints, 2)
  assert.equal(unit.hasMoved, false)
  assert.equal(unit.lastMove, null)
})

test('undo move is blocked after attacking or without a previous move', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes)
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const G = { hexes, units: [unit], terrainMap, log: [] }

  const noMoveResult = MedievalBattleGame.phases.battle.moves.undoMove(
    { G, ctx: {}, playerID: '0' },
    unit.id
  )
  assert.equal(noMoveResult, INVALID_MOVE)

  unit.lastMove = { q: 0, r: 0, s: 0, movePoints: 2, hasMoved: false }
  unit.hasAttacked = true

  const attackedResult = MedievalBattleGame.phases.battle.moves.undoMove(
    { G, ctx: {}, playerID: '0' },
    unit.id
  )
  assert.equal(attackedResult, INVALID_MOVE)
})

test('battle endTurn clears selected unit', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  game.units.push(unit)
  game.selectedUnitId = unit.id

  MedievalBattleGame.phases.battle.moves.endTurn({
    G: game,
    ctx,
    playerID: '0',
    events: { endTurn: () => {} },
  })

  assert.equal(game.selectedUnitId, null)
})

test('units can embark and disembark with transport stat changes and full move points', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'WATER',
    '0,1': 'PLAIN',
  })
  const unit = createUnit('KNIGHT', '0', 0, 0)
  unit.currentHP = 75
  const G = { hexes, units: [unit], terrainMap, log: [] }

  const embarkResult = MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  assert.equal(embarkResult, undefined)
  assert.equal(unit.isTransport, true)
  assert.equal(unit.isNaval, true)
  assert.equal(unit.maxMovePoints, 2)
  assert.equal(unit.range, 1)
  assert.equal(unit.movePoints, 0)
  assert.equal(unit.hasAttacked, true)
  assert.equal(unit.currentHP, 20)

  unit.movePoints = unit.maxMovePoints
  unit.hasAttacked = false
  unit.hasMoved = false

  const disembarkResult = MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    0,
    1
  )
  assert.equal(disembarkResult, undefined)
  assert.equal(unit.isTransport, false)
  assert.equal(unit.isNaval, false)
  assert.equal(unit.maxMovePoints, 3)
  assert.equal(unit.currentHP, 75)
  assert.equal(unit.movePoints, 0)
  assert.equal(unit.hasAttacked, true)
})

test('embark and disembark require full movement points', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'WATER',
    '0,1': 'PLAIN',
  })
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.movePoints = 1
  const G = { hexes, units: [unit], terrainMap, log: [] }

  const embarkResult = MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  assert.equal(embarkResult, INVALID_MOVE)

  unit.movePoints = unit.maxMovePoints
  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  unit.movePoints = 1

  const disembarkResult = MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    0,
    1
  )
  assert.equal(disembarkResult, INVALID_MOVE)
})

test('transport ships stay at sea unless disembarking on land', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'WATER',
    '0,1': 'WATER',
  })
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const G = { hexes, units: [unit], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  unit.movePoints = unit.maxMovePoints
  unit.hasMoved = false
  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    0,
    1
  )
  assert.equal(unit.isTransport, true)
})

test('disembarking prevents immediate attacks', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'WATER',
    '0,1': 'PLAIN',
  })
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const target = createUnit('MILITIA', '1', -1, 1)
  const G = { hexes, units: [unit, target], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  unit.movePoints = unit.maxMovePoints
  unit.hasAttacked = false
  unit.hasMoved = false
  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    0,
    1
  )

  const attackResult = MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    target.id
  )
  assert.equal(attackResult, INVALID_MOVE)
})

test('transport destruction removes embarked unit', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '1,0': 'WATER' })
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const attacker = createUnit('CATAPULT', '1', 0, 1)
  attacker.attackPower = 100
  const G = { hexes, units: [unit, attacker], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '1' },
    attacker.id,
    unit.id
  )

  assert.equal(G.units.some((u) => u.id === unit.id), false)
})

test('transport stat swaps preserve health ratios', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '1,0': 'WATER', '0,1': 'PLAIN' })
  const unit = createUnit('ARCHER', '0', 0, 0)
  unit.currentHP = 30
  const G = { hexes, units: [unit], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    1,
    0
  )
  assert.equal(unit.currentHP, 20)

  unit.movePoints = unit.maxMovePoints
  unit.hasAttacked = false
  unit.hasMoved = false
  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    unit.id,
    0,
    1
  )
  assert.equal(unit.currentHP, 30)
  assert.equal(unit.range, 2)
})

test('transport disables catapult siege limitations', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '1,0': 'WATER', '0,1': 'PLAIN' })
  const catapult = createUnit('CATAPULT', '0', 0, 0)
  const attacker = createUnit('SWORDSMAN', '1', 0, 1)
  const G = { hexes, units: [catapult, attacker], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G, ctx: {}, playerID: '0' },
    catapult.id,
    1,
    0
  )

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '1' },
    attacker.id,
    catapult.id
  )

  assert.ok(attacker.currentHP < attacker.maxHP)
})

test('archers deal reduced counter-attack damage in melee', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes)
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const target = createUnit('ARCHER', '1', 1, 0)
  const G = { hexes, units: [attacker, target], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    attacker.id,
    target.id
  )

  assert.equal(attacker.currentHP, attacker.maxHP - 13)
})

test('catapults do not counter-attack in melee', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes)
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const target = createUnit('CATAPULT', '1', 1, 0)
  const G = { hexes, units: [attacker, target], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    attacker.id,
    target.id
  )

  assert.equal(attacker.currentHP, attacker.maxHP)
})

test('catapult movement accounts for hill move cost reduction', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '1,0': 'HILLS' })
  const catapult = createUnit('CATAPULT', '0', 0, 0)

  const reachable = getReachableHexes(catapult, hexes, [], terrainMap)
  assert.ok(reachable.some((hex) => hex.q === 1 && hex.r === 0))
})

test('archers and catapults gain hill attack bonus', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '0,0': 'HILLS' })

  const archer = createUnit('ARCHER', '0', 0, 0)
  const archerTarget = createUnit('SWORDSMAN', '1', 1, 0)
  let G = { hexes, units: [archer, archerTarget], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    archer.id,
    archerTarget.id
  )
  assert.equal(archerTarget.currentHP, archerTarget.maxHP - 35)

  const catapult = createUnit('CATAPULT', '0', 0, 0)
  const catapultTarget = createUnit('SWORDSMAN', '1', 1, 0)
  G = { hexes, units: [catapult, catapultTarget], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    catapult.id,
    catapultTarget.id
  )
  assert.equal(catapultTarget.currentHP, catapultTarget.maxHP - 55)
})

test('war galleys can only reach water tiles', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '0,0': 'WATER',
    '1,0': 'PLAIN',
    '0,1': 'WATER',
  })
  const galley = createUnit('WAR_GALLEY', '0', 0, 0)
  const reachable = getReachableHexes(galley, hexes, [], terrainMap)

  assert.ok(reachable.some((hex) => hex.q === 0 && hex.r === 1))
  assert.equal(reachable.some((hex) => hex.q === 1 && hex.r === 0), false)
})

test('terrain defense bonuses reduce incoming damage', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, { '1,0': 'FOREST' })
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const defender = createUnit('SWORDSMAN', '1', 1, 0)
  const G = { hexes, units: [attacker, defender], terrainMap, log: [] }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G, ctx: {}, playerID: '0' },
    attacker.id,
    defender.id
  )

  assert.equal(defender.currentHP, defender.maxHP - 15)
})


test('city-like terrains match city movement and defense values', () => {
  const cityLikeTerrains = ['BARRACKS', 'CASTLE', 'CATHEDRAL', 'FARM', 'LIBRARY', 'MOSQUE', 'HOSPITAL', 'UNIVERSITY']
  cityLikeTerrains.forEach((terrain) => {
    assert.equal(TERRAIN_TYPES[terrain].defenseBonus, TERRAIN_TYPES.CITY.defenseBonus)
    assert.equal(TERRAIN_TYPES[terrain].moveCost, TERRAIN_TYPES.CITY.moveCost)
    assert.equal(TERRAIN_TYPES[terrain].passable, TERRAIN_TYPES.CITY.passable)
  })
})

test('walls are impassable and floor has fast movement cost', () => {
  assert.equal(TERRAIN_TYPES.WALL.passable, false)
  assert.equal(TERRAIN_TYPES.WALL.moveCost, Infinity)
  assert.equal(TERRAIN_TYPES.WALL.maxHP, 100)
  assert.equal(TERRAIN_TYPES.FLOOR.defenseBonus, 0)
  assert.equal(TERRAIN_TYPES.FLOOR.moveCost, 0.5)
})

test('attackTerrain damages wall and converts destroyed wall to floor', () => {
  const hexes = makeHexGrid(1)
  const attacker = createUnit('CATAPULT', '0', 0, 0)
  const G = {
    hexes,
    units: [attacker],
    terrainMap: makeTerrainMap(hexes, { '1,0': 'WALL' }),
    terrainHealth: { '1,0': 40 },
    teamMode: false,
    log: [],
  }

  MedievalBattleGame.phases.battle.moves.attackTerrain(
    { G, ctx: {}, playerID: '0' },
    attacker.id,
    1,
    0
  )

  assert.equal(G.terrainMap['1,0'], 'FLOOR')
  assert.equal(G.terrainHealth['1,0'], undefined)
  assert.equal(attacker.hasAttacked, true)
})

test('team spawn zones share deployment areas within teams and differ between teams', () => {
  const mapWidth = 6
  assert.equal(isInSpawnZone(-4, 0, '0', mapWidth, true), true)
  assert.equal(isInSpawnZone(-4, 0, '2', mapWidth, true), true)
  assert.equal(isInSpawnZone(-4, 0, '1', mapWidth, true), false)
  assert.equal(isInSpawnZone(4, 0, '1', mapWidth, true), true)
  assert.equal(isInSpawnZone(4, 0, '3', mapWidth, true), true)
  assert.equal(isInSpawnZone(4, 0, '0', mapWidth, true), false)
})

test('deployable hexes stay in spawn zones and respect team mode', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes)
  const deployable = getDeployableHexes({
    unitType: 'SWORDSMAN',
    hexes,
    units: [],
    terrainMap,
    playerID: '2',
    mapWidth: 3,
    teamMode: true,
  })

  assert.ok(deployable.length > 0)
  assert.ok(
    deployable.every((hex) => isInSpawnZone(hex.q, hex.r, '2', 3, true))
  )
})

test('setup readiness ends when all active players are ready', () => {
  const G = {
    units: [createUnit('SWORDSMAN', '0', 0, 0), createUnit('SWORDSMAN', '1', 1, 0)],
    playersReady: { '0': true, '1': true },
  }
  const ctx = { playOrder: ['0', '1'] }
  const result = MedievalBattleGame.phases.setup.endIf({ G, ctx })
  assert.equal(result, true)
})

test('elimination victory triggers when one player has no units', () => {
  const G = {
    teamMode: false,
    gameMode: 'ELIMINATION',
    turn: 3,
    units: [createUnit('SWORDSMAN', '1', 0, 0)],
  }
  const ctx = { phase: 'battle' }
  const result = MedievalBattleGame.endIf({ G, ctx })
  assert.equal(result.winner, '1')
  assert.equal(result.victoryType, 'elimination')
})

test('sanitizeChatMessage removes control characters and normalizes spaces', () => {
  assert.equal(sanitizeChatMessage('Hi\u0000\u0007 there'), 'Hi there')
  assert.equal(sanitizeChatMessage('Hi   there   friend'), 'Hi there friend')
})

test('validatePayload reports missing required fields', () => {
  const schema = {
    playerID: { required: true, sanitize: sanitizePlayerID },
    unitType: { required: true, sanitize: sanitizeUnitType },
  }
  const result = validatePayload({ unitType: 'archer' }, schema)
  assert.ok(result.error.includes('Missing required field: playerID'))
})

test('map 3 is all water', () => {
  const data = generateMapData('MAP_3')
  const terrains = new Set(Object.values(data.terrainMap))
  assert.deepEqual(Array.from(terrains), ['WATER'])
})

test('map 2 contains varied terrain', () => {
  const data = generateMapData('MAP_2')
  const terrains = new Set(Object.values(data.terrainMap))
  assert.ok(terrains.has('WATER'))
  assert.ok(terrains.has('FOREST'))
  assert.ok(terrains.has('HILLS'))
  assert.ok(terrains.has('MOUNTAIN'))
})

test('getAttackableHexes respects range limits', () => {
  const hexes = makeHexGrid(3)
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const farEnemy = createUnit('SWORDSMAN', '1', 2, 0)
  const nearEnemy = createUnit('SWORDSMAN', '1', 1, 0)
  const targets = getAttackableHexes(attacker, hexes, [farEnemy, nearEnemy], {
    teamMode: false,
  })
  assert.equal(targets.some((hex) => hex.q === 1 && hex.r === 0), true)
  assert.equal(targets.some((hex) => hex.q === 2 && hex.r === 0), false)
})

test('getReachableHexes disallows naval units on land', () => {
  const hexes = makeHexGrid(1)
  const terrainMap = makeTerrainMap(hexes, {
    '1,0': 'PLAIN',
  })
  const unit = createUnit('WAR_GALLEY', '0', 0, 0)
  const reachable = getReachableHexes(unit, hexes, [], terrainMap)
  assert.equal(reachable.some((hex) => hex.q === 1 && hex.r === 0), false)
})

test('setup phase placeUnit validates spawn zone and occupancy', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'setup' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  const moves = MedievalBattleGame.phases.setup.moves
  const mapWidth = game.mapSize.width
  const leftSpawnQ = -mapWidth + 2
  moves.placeUnit({ G: game, ctx, playerID: '0' }, 'SWORDSMAN', leftSpawnQ, 0)
  assert.equal(game.units.length, 1)
  moves.placeUnit({ G: game, ctx, playerID: '0' }, 'SWORDSMAN', leftSpawnQ, 0)
  assert.equal(game.units.length, 1)
})

test('battle phase moveUnit rejects invalid moves', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  game.units.push(unit)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.moveUnit({ G: game, ctx, playerID: '1' }, unit.id, 1, 0)
  assert.equal(unit.q, 0)
  assert.equal(unit.r, 0)
})

test('battle phase attackUnit enforces range and ownership', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const target = createUnit('SWORDSMAN', '1', 2, 0)
  game.units.push(attacker, target)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.attackUnit({ G: game, ctx, playerID: '1' }, attacker.id, target.id)
  assert.equal(attacker.currentHP, attacker.maxHP)
  assert.equal(target.currentHP, target.maxHP)
  moves.attackUnit({ G: game, ctx, playerID: '0' }, attacker.id, target.id)
  assert.equal(attacker.currentHP, attacker.maxHP)
  assert.equal(target.currentHP, target.maxHP)
})

test('battle phase attackUnit applies terrain defense bonus', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const attacker = createUnit('SWORDSMAN', '0', 0, 0)
  const target = createUnit('SWORDSMAN', '1', 1, 0)
  const targetKey = `${target.q},${target.r}`
  game.terrainMap[targetKey] = 'FOREST'
  game.units.push(attacker, target)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.attackUnit({ G: game, ctx, playerID: '0' }, attacker.id, target.id)
  const expectedDamage = Math.max(
    1,
    attacker.attackPower - TERRAIN_TYPES.FOREST.defenseBonus
  )
  assert.equal(target.currentHP, target.maxHP - expectedDamage)
})

test('battle phase attackUnit applies hill bonus for archers', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const attacker = createUnit('ARCHER', '0', 0, 0)
  const target = createUnit('SWORDSMAN', '1', 1, 0)
  game.terrainMap['0,0'] = 'HILLS'
  game.units.push(attacker, target)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.attackUnit({ G: game, ctx, playerID: '0' }, attacker.id, target.id)
  const expectedDamage = Math.max(
    1,
    attacker.attackPower + 5 - TERRAIN_TYPES.PLAIN.defenseBonus
  )
  assert.equal(target.currentHP, target.maxHP - expectedDamage)
})



test('battle phase knight spends 2 move points entering city tile', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const knight = createUnit('KNIGHT', '0', 0, 0)
  knight.movePoints = 1
  game.terrainMap['1,0'] = 'CITY'
  game.units.push(knight)
  const reachable = getReachableHexes(knight, game.hexes, game.units, game.terrainMap)
  assert.equal(reachable.some((hex) => hex.q === 1 && hex.r === 0), false)
})

test('battle phase knight does 25% less damage while attacking from city tile', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const attacker = createUnit('KNIGHT', '0', 0, 0)
  const target = createUnit('SWORDSMAN', '1', 1, 0)
  game.terrainMap['0,0'] = 'CITY'
  game.units.push(attacker, target)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.attackUnit({ G: game, ctx, playerID: '0' }, attacker.id, target.id)
  const expectedDamage = Math.max(1, Math.round(attacker.attackPower * 0.75) - TERRAIN_TYPES.PLAIN.defenseBonus)
  assert.equal(target.currentHP, target.maxHP - expectedDamage)
})
test('battle phase endTurn resets unit actions', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  game.phase = 'battle'
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = true
  unit.movePoints = 0
  game.units.push(unit)
  const moves = MedievalBattleGame.phases.battle.moves
  moves.endTurn({ G: game, ctx, playerID: '0', events: { endTurn() {} } })
  assert.equal(unit.hasMoved, false)
  assert.equal(unit.hasAttacked, false)
  assert.equal(unit.movePoints, unit.maxMovePoints)
  assert.equal(unit.lastMove, null)
})

test('setup phase readyForBattle marks players ready', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'setup' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  const moves = MedievalBattleGame.phases.setup.moves
  moves.readyForBattle({
    G: game,
    ctx,
    playerID: '0',
    events: { endTurn() {} },
  })
  assert.equal(game.playersReady['0'], true)
})

test('setup phase endIf requires active players to be ready', () => {
  const ctx = { numPlayers: 2, playOrder: ['0', '1'], phase: 'setup' }
  const game = MedievalBattleGame.setup({ ctx, setupData: {} })
  const moves = MedievalBattleGame.phases.setup.moves
  const mapWidth = game.mapSize.width
  const leftSpawnQ = -mapWidth + 2
  const rightSpawnQ = mapWidth - 2
  moves.placeUnit({ G: game, ctx, playerID: '0' }, 'SWORDSMAN', leftSpawnQ, 0)
  moves.placeUnit({ G: game, ctx, playerID: '1' }, 'SWORDSMAN', rightSpawnQ, 0)
  assert.equal(
    MedievalBattleGame.phases.setup.endIf({ G: game, ctx }),
    false
  )
  game.playersReady['0'] = true
  game.playersReady['1'] = true
  assert.equal(
    MedievalBattleGame.phases.setup.endIf({ G: game, ctx }),
    true
  )
})

test('turn order playOrder skips inactive players in team mode', () => {
  const ctx = { numPlayers: 4, playOrder: ['0', '1', '2', '3'] }
  const game = MedievalBattleGame.setup({ ctx, setupData: { teamMode: true } })
  game.inactivePlayers = ['2']
  const playOrder = MedievalBattleGame.turn.order.playOrder({ G: game, ctx })
  assert.deepEqual(playOrder, ['0', '1', '3'])
})

test('getUnitVisionRange adjusts for hills and forests', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const hexes = makeHexGrid(3)
  const terrainMap = makeTerrainMap(hexes, {
    '0,0': 'PLAIN',
    '1,0': 'FOREST',
    '2,0': 'HILLS',
  })

  assert.equal(getUnitVisionRange(unit, terrainMap), 3)
  assert.equal(getUnitVisionRange({ ...unit, q: 1, r: 0, s: -1 }, terrainMap), 2)
  assert.equal(getUnitVisionRange({ ...unit, q: 2, r: 0, s: -2 }, terrainMap), 5)
})

test('getVisibleHexesForPlayer shares ally vision in team mode', () => {
  const hexes = makeHexGrid(4)
  const terrainMap = makeTerrainMap(hexes)
  const units = [
    { id: 'u1', ownerID: '0', q: 0, r: 0, s: 0, currentHP: 10 },
    { id: 'u2', ownerID: '2', q: 2, r: 0, s: -2, currentHP: 10 },
  ]

  const visible = getVisibleHexesForPlayer({
    units,
    hexes,
    terrainMap,
    playerID: '0',
    teamMode: true,
  })

  assert.equal(visible.has('2,0'), true)
  assert.equal(visible.has('4,0'), true)
})

test('getVisibleUnitsForPlayer respects forest concealment', () => {
  const hexes = makeHexGrid(4)
  const terrainMap = makeTerrainMap(hexes, {
    '3,0': 'FOREST',
    '2,0': 'FOREST',
  })
  const units = [
    { id: 'ally', ownerID: '0', q: 0, r: 0, s: 0, currentHP: 10 },
    { id: 'enemyFar', ownerID: '1', q: 3, r: 0, s: -3, currentHP: 10 },
    { id: 'enemyNear', ownerID: '1', q: 2, r: 0, s: -2, currentHP: 10 },
  ]

  const visibleUnits = getVisibleUnitsForPlayer({
    units,
    hexes,
    terrainMap,
    playerID: '0',
    teamMode: false,
  })

  const visibleIds = visibleUnits.map(unit => unit.id)
  assert.equal(visibleIds.includes('enemyFar'), false)
  assert.equal(visibleIds.includes('enemyNear'), true)
})

test('getVisibleUnitsForPlayer limits visibility outside vision range', () => {
  const hexes = makeHexGrid(5)
  const terrainMap = makeTerrainMap(hexes, {
    '0,0': 'PLAIN',
  })
  const units = [
    { id: 'ally', ownerID: '0', q: 0, r: 0, s: 0, currentHP: 10 },
    { id: 'enemyNear', ownerID: '1', q: 2, r: 0, s: -2, currentHP: 10 },
    { id: 'enemyFar', ownerID: '1', q: 4, r: 0, s: -4, currentHP: 10 },
  ]

  const visibleUnits = getVisibleUnitsForPlayer({
    units,
    hexes,
    terrainMap,
    playerID: '0',
    teamMode: false,
  })

  const visibleIds = visibleUnits.map(unit => unit.id)
  assert.equal(visibleIds.includes('enemyNear'), true)
  assert.equal(visibleIds.includes('enemyFar'), false)
})


test('getRetreatActivationTurn follows per-map thresholds', () => {
  assert.equal(getRetreatActivationTurn('MAP_1'), 9)
  assert.equal(getRetreatActivationTurn('MAP_2'), 13)
  assert.equal(getRetreatActivationTurn('MAP_3'), 9)
  assert.equal(getRetreatActivationTurn('MAP_4'), 25)
})

test('getRetreatZoneForPlayer returns two-edge columns per side', () => {
  const { hexes } = generateMapData('MAP_1')
  const left = getRetreatZoneForPlayer({
    hexes,
    mapWidth: MAPS.MAP_1.size.width,
    playerID: '0',
    teamMode: false,
  })
  const right = getRetreatZoneForPlayer({
    hexes,
    mapWidth: MAPS.MAP_1.size.width,
    playerID: '1',
    teamMode: false,
  })

  assert.ok(left.length > 0)
  assert.ok(right.length > 0)
  assert.ok(left.every((hex) => (hex.q + Math.floor(hex.r / 2)) <= -5))
  assert.ok(right.every((hex) => (hex.q + Math.floor(hex.r / 2)) >= 5))
})

test('shouldEmitDamageOnRemoval skips setup and retreat removals', () => {
  assert.equal(shouldEmitDamageOnRemoval('setup'), false)
  assert.equal(shouldEmitDamageOnRemoval('battle'), true)
  assert.equal(shouldEmitDamageOnRemoval('battle', 'u1', ['u1']), false)
  assert.equal(shouldEmitDamageOnRemoval('battle', 'u2', ['u1']), true)
  assert.equal(shouldEmitDamageOnRemoval(null), true)
})


test('getUnitActionRingImage returns color ring asset path', () => {
  assert.equal(getUnitActionRingImage('0'), '/units/ring_blue.png')
  assert.equal(getUnitActionRingImage('1'), '/units/ring_red.png')
  assert.equal(getUnitActionRingImage('unknown'), '/units/ring_blue.png')
})

test('shouldShowUnitActionRing shows when unit can still move', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  const units = [unit, createUnit('SWORDSMAN', '1', 2, -2)]

  assert.equal(
    shouldShowUnitActionRing({ unit, units, currentPlayerID: '0', teamMode: false }),
    true
  )
})

test('shouldShowUnitActionRing hides when unit moved and attacked', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = true
  const units = [unit, createUnit('SWORDSMAN', '1', 1, -1)]

  assert.equal(
    shouldShowUnitActionRing({ unit, units, currentPlayerID: '0', teamMode: false }),
    false
  )
})

test('shouldShowUnitActionRing shows when moved but enemy remains in attack range', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = false
  const units = [unit, createUnit('SWORDSMAN', '1', 1, -1)]

  assert.equal(
    shouldShowUnitActionRing({ unit, units, currentPlayerID: '0', teamMode: false }),
    true
  )
})

test('shouldShowUnitActionRing hides when moved and no enemies are attackable', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = false
  const units = [unit, createUnit('SWORDSMAN', '1', 3, -3)]

  assert.equal(
    shouldShowUnitActionRing({ unit, units, currentPlayerID: '0', teamMode: false }),
    false
  )
})

test('shouldShowUnitActionRing respects team mode allied units', () => {
  const unit = createUnit('SWORDSMAN', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = false
  const alliedNearby = createUnit('SWORDSMAN', '2', 1, -1)
  const enemyFar = createUnit('SWORDSMAN', '1', 4, -4)

  assert.equal(
    shouldShowUnitActionRing({
      unit,
      units: [unit, alliedNearby, enemyFar],
      currentPlayerID: '0',
      teamMode: true,
    }),
    false
  )
})

test('shouldShowUnitActionRing accounts for visible enemies when fog of war is enabled', () => {
  const unit = createUnit('ARCHER', '0', 0, 0)
  unit.hasMoved = true
  unit.hasAttacked = false
  const hiddenEnemy = createUnit('SWORDSMAN', '1', 2, -2)

  assert.equal(
    shouldShowUnitActionRing({
      unit,
      units: [unit, hiddenEnemy],
      currentPlayerID: '0',
      teamMode: false,
      visibleUnitIds: new Set([unit.id]),
    }),
    false
  )

  assert.equal(
    shouldShowUnitActionRing({
      unit,
      units: [unit, hiddenEnemy],
      currentPlayerID: '0',
      teamMode: false,
      visibleUnitIds: new Set([unit.id, hiddenEnemy.id]),
    }),
    true
  )
})


test('encirclement is only opposite-side adjacency', () => {
  const hexes = makeHexGrid(3)
  const terrainMap = makeTerrainMap(hexes)

  const triggerMoraleTick = (G) => {
    const mover = G.units.find((u) => u.ownerID === '0' && u.id !== G.centerId)
    MedievalBattleGame.phases.battle.moves.moveUnit({ G, ctx: {}, playerID: '0' }, mover.id, mover.q + 1, mover.r)
  }

  const center = createUnit('SWORDSMAN', '0', 0, 0)
  const helper = createUnit('SWORDSMAN', '0', -3, 0)
  const left = createUnit('SWORDSMAN', '1', -1, 0)
  const right = createUnit('SWORDSMAN', '1', 1, 0)
  let G = { hexes, units: [center, helper, left, right], terrainMap, log: [], teamMode: false, centerId: center.id }
  triggerMoraleTick(G)
  assert.equal(center.morale, 'LOW')
  MedievalBattleGame.phases.battle.moves.moveUnit({ G, ctx: {}, playerID: '1' }, right.id, 2, 0)
  assert.equal(center.morale, 'NEUTRAL')

  const center2 = createUnit('SWORDSMAN', '0', 0, 0)
  const helper2 = createUnit('SWORDSMAN', '0', -3, 0)
  const enemyLeft = createUnit('SWORDSMAN', '1', -1, 0)
  const enemyTopRight = createUnit('SWORDSMAN', '1', 1, -1)
  G = { hexes, units: [center2, helper2, enemyLeft, enemyTopRight], terrainMap, log: [], teamMode: false, centerId: center2.id }
  triggerMoraleTick(G)
  assert.equal(center2.morale, 'NEUTRAL')

  const center3 = createUnit('SWORDSMAN', '0', 0, 0)
  const helper3 = createUnit('SWORDSMAN', '0', -3, 0)
  const enemyBottomLeft = createUnit('SWORDSMAN', '1', -1, 1)
  const enemyTopRight2 = createUnit('SWORDSMAN', '1', 1, -1)
  G = { hexes, units: [center3, helper3, enemyBottomLeft, enemyTopRight2], terrainMap, log: [], teamMode: false, centerId: center3.id }
  triggerMoraleTick(G)
  assert.equal(center3.morale, 'LOW')
})

test('morale damage modifiers and transitions are applied', () => {
  const hexes = makeHexGrid(2)
  const terrainMap = makeTerrainMap(hexes)

  const lowAttacker = createUnit('SWORDSMAN', '0', 0, 0)
  lowAttacker.morale = 'LOW'
  lowAttacker.moraleBase = 'NEUTRAL'
  const defender = createUnit('SWORDSMAN', '1', 1, 0)
  let G = { hexes, units: [lowAttacker, defender], terrainMap, log: [], teamMode: false }
  MedievalBattleGame.phases.battle.moves.attackUnit({ G, ctx: {}, playerID: '0' }, lowAttacker.id, defender.id)
  assert.equal(defender.currentHP, defender.maxHP - 20)

  const highAttacker = createUnit('SWORDSMAN', '0', 0, 0)
  highAttacker.morale = 'HIGH'
  highAttacker.moraleBase = 'HIGH'
  const defender2 = createUnit('SWORDSMAN', '1', 1, 0)
  G = { hexes, units: [highAttacker, defender2], terrainMap, log: [], teamMode: false }
  MedievalBattleGame.phases.battle.moves.attackUnit({ G, ctx: {}, playerID: '0' }, highAttacker.id, defender2.id)
  assert.equal(defender2.currentHP, defender2.maxHP - 30)

  const killer = createUnit('SWORDSMAN', '0', 0, 0)
  killer.morale = 'LOW'
  killer.moraleBase = 'NEUTRAL'
  const weakTarget = createUnit('MILITIA', '1', 1, 0)
  weakTarget.currentHP = 1
  G = { hexes, units: [killer, weakTarget], terrainMap, log: [], teamMode: false }
  MedievalBattleGame.phases.battle.moves.attackUnit({ G, ctx: {}, playerID: '0' }, killer.id, weakTarget.id)
  assert.equal(killer.morale, 'NEUTRAL')
})




test('naval units ignore encirclement morale debuff but still gain kill morale bonus', () => {
  const hexes = makeHexGrid(3)
  const terrainMap = makeTerrainMap(hexes)

  const galley = createUnit('WAR_GALLEY', '0', 0, 0)
  galley.morale = 'NEUTRAL'
  galley.moraleBase = 'NEUTRAL'
  const helper = createUnit('SWORDSMAN', '0', -3, 0)
  const leftEnemy = createUnit('SWORDSMAN', '1', -1, 0)
  const rightEnemy = createUnit('SWORDSMAN', '1', 1, 0)

  const encircledGame = { hexes, units: [galley, helper, leftEnemy, rightEnemy], terrainMap, log: [], teamMode: false }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G: encircledGame, ctx: {}, playerID: '0' },
    helper.id,
    -2,
    0
  )

  assert.equal(galley.morale, 'NEUTRAL')

  const weakTarget = createUnit('MILITIA', '1', 1, 0)
  weakTarget.currentHP = 1
  const killGame = { hexes, units: [galley, weakTarget], terrainMap, log: [], teamMode: false }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G: killGame, ctx: {}, playerID: '0' },
    galley.id,
    weakTarget.id
  )

  assert.equal(galley.morale, 'HIGH')
})
test('morale transitions obey high-to-neutral on encirclement and neutral-to-high on kill', () => {
  const hexes = makeHexGrid(3)
  const terrainMap = makeTerrainMap(hexes)

  const center = createUnit('SWORDSMAN', '0', 0, 0)
  center.morale = 'HIGH'
  center.moraleBase = 'HIGH'
  const helper = createUnit('SWORDSMAN', '0', -3, 0)
  const left = createUnit('SWORDSMAN', '1', -1, 0)
  const right = createUnit('SWORDSMAN', '1', 1, 0)
  const encircledGame = { hexes, units: [center, helper, left, right], terrainMap, log: [], teamMode: false }

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G: encircledGame, ctx: {}, playerID: '0' },
    helper.id,
    -2,
    0
  )

  assert.equal(center.morale, 'NEUTRAL')

  MedievalBattleGame.phases.battle.moves.moveUnit(
    { G: encircledGame, ctx: {}, playerID: '1' },
    right.id,
    2,
    0
  )

  assert.equal(center.morale, 'HIGH')

  const killer = createUnit('SWORDSMAN', '0', 0, 0)
  killer.morale = 'NEUTRAL'
  killer.moraleBase = 'NEUTRAL'
  const weakTarget = createUnit('MILITIA', '1', 1, 0)
  weakTarget.currentHP = 1
  const killGame = { hexes, units: [killer, weakTarget], terrainMap, log: [], teamMode: false }

  MedievalBattleGame.phases.battle.moves.attackUnit(
    { G: killGame, ctx: {}, playerID: '0' },
    killer.id,
    weakTarget.id
  )

  assert.equal(killer.morale, 'HIGH')
})

test('retreatUnit removes selected unit and tracks it as surviving', () => {
  const ctx = { numPlayers: 2, currentPlayer: '0', playOrder: ['0', '1'], playOrderPos: 0, phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: { mapId: 'MAP_1' } })
  game.phase = 'battle'
  game.turn = 9

  const unit = createUnit('SWORDSMAN', '0', -6, 0)
  game.units = [unit]

  const result = MedievalBattleGame.phases.battle.moves.retreatUnit(
    { G: game, ctx, playerID: '0' },
    unit.id
  )

  assert.equal(result, undefined)
  assert.equal(game.units.length, 0)
  assert.equal(game.retreatedUnits.length, 1)
  assert.equal(game.retreatedUnits[0].id, unit.id)
  assert.equal(game.retreatedUnitIds.includes(unit.id), true)
})

test('retreatUnit is blocked before map retreat turn and outside retreat zone', () => {
  const ctx = { numPlayers: 2, currentPlayer: '0', playOrder: ['0', '1'], playOrderPos: 0, phase: 'battle' }
  const game = MedievalBattleGame.setup({ ctx, setupData: { mapId: 'MAP_2' } })
  game.phase = 'battle'

  const tooEarly = createUnit('SWORDSMAN', '0', -8, 0)
  game.units = [tooEarly]
  game.turn = 12
  assert.equal(
    MedievalBattleGame.phases.battle.moves.retreatUnit({ G: game, ctx, playerID: '0' }, tooEarly.id),
    INVALID_MOVE
  )

  const wrongZone = createUnit('SWORDSMAN', '0', 0, 0)
  game.units = [wrongZone]
  game.turn = 13
  assert.equal(
    MedievalBattleGame.phases.battle.moves.retreatUnit({ G: game, ctx, playerID: '0' }, wrongZone.id),
    INVALID_MOVE
  )
})
