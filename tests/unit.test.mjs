import test from 'node:test'
import assert from 'node:assert/strict'
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
  createUnit,
  getAttackableHexes,
  getDeployableHexes,
  getHexesInRange,
  getNeighbors,
  getReachableHexes,
  hexDistance,
  isHexOccupied,
  isInSpawnZone,
  getUnitAtHex,
  MedievalBattleGame,
} from '../game/GameLogic.js'

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

test('sanitizeGameId strips invalid characters and limits length', () => {
  assert.equal(sanitizeGameId('game-1'), 'game-1')
  assert.equal(sanitizeGameId(' game<>/'), 'game')
  assert.equal(sanitizeGameId('a'.repeat(60)).length, 50)
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
  assert.equal(sanitizeAction('invalidAction'), null)
})

test('sanitizeChatMessage strips control chars and HTML', () => {
  assert.equal(sanitizeChatMessage('hello'), 'hello')
  assert.equal(sanitizeChatMessage('hey<>there'), 'heythere')
  assert.equal(sanitizeChatMessage('a'.repeat(200)).length, 120)
})

test('sanitizeMapId validates map identifiers', () => {
  assert.equal(sanitizeMapId('map_1'), 'MAP_1')
  assert.equal(sanitizeMapId('MAP_4'), null)
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

test('MAPS exposes known map ids', () => {
  assert.deepEqual(Object.keys(MAPS), ['MAP_1', 'MAP_2', 'MAP_3'])
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

test('isInSpawnZone honors team mode', () => {
  assert.equal(isInSpawnZone(-4, 0, '0', 6, false), true)
  assert.equal(isInSpawnZone(4, 0, '1', 6, false), true)
  assert.equal(isInSpawnZone(-4, 0, '1', 6, false), false)
  assert.equal(isInSpawnZone(-4, 0, '0', 6, true), true)
  assert.equal(isInSpawnZone(4, 0, '1', 6, true), true)
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
