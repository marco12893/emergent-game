import { NextResponse } from 'next/server'
import { getGame, setGame } from '@/lib/gameState'
import { 
  sanitizeGameId, 
  sanitizePlayerID, 
  sanitizeUnitId, 
  sanitizeUnitType, 
  sanitizeCoordinate, 
  sanitizeAction,
  sanitizeChatMessage,
  sanitizePlayerName,
  sanitizeParticipantID,
  validatePayload 
} from '@/lib/inputSanitization'
import { isInSpawnZone } from '@/game/GameLogic'
import { areAllies, getTeamId, getTeamLabel } from '@/game/teamUtils'
import { createMap4ObjectiveState, getMap4VictoryInfo } from '@/game/map4Objectives'
import { advanceTurn, getGamePlayOrder, hasTurnTimedOut, setTurnTimerForCurrentPlayer } from '@/lib/turnTimer'

// ============================================
// UNIT & TERRAIN DEFINITIONS
// ============================================

const UNIT_TYPES = {
  SWORDSMAN: {
    type: 'SWORDSMAN',
    name: 'Swordsman',
    image: 'swordsman',
    maxHP: 100,
    attackPower: 25,
    movePoints: 2,
    range: 1,
    description: 'Balanced infantry unit.',
  },
  ARCHER: {
    type: 'ARCHER',
    name: 'Archer',
    image: 'archer',
    maxHP: 60,
    attackPower: 30,
    movePoints: 2,
    range: 2,
    description: 'Ranged unit with extended range.',
  },
  KNIGHT: {
    type: 'KNIGHT',
    name: 'Knight',
    image: 'knight',
    maxHP: 150,
    attackPower: 30,
    movePoints: 3,
    range: 1,
    description: 'Heavy cavalry with high HP and movement.',
  },
  MILITIA: {
    type: 'MILITIA',
    name: 'Militia',
    image: 'militia',
    maxHP: 40,
    attackPower: 20,
    movePoints: 2,
    range: 1,
    description: 'Light infantry unit.',
  },
  CATAPULT: {
    type: 'CATAPULT',
    name: 'Catapult',
    image: 'catapult',
    maxHP: 40,
    attackPower: 50,
    movePoints: 1,
    range: 3,
    description: 'Siege weapon with high damage but cannot move and attack in same turn.',
  },
  WAR_GALLEY: {
    type: 'WAR_GALLEY',
    name: 'War Galley',
    image: 'war_galley',
    maxHP: 150,
    attackPower: 30,
    movePoints: 3,
    range: 2,
    isNaval: true,
    description: 'Naval unit that can only move on water.',
  },
}

const isValidPlayerForGame = (playerID, game) => {
  if (playerID === 'spectator') return true
  const maxPlayers = game.maxPlayers || 2
  const numericId = Number(playerID)
  if (!Number.isInteger(numericId)) return false
  return numericId >= 0 && numericId < maxPlayers
}

const pickRandomLeader = (players = {}, excludedId = null) => {
  const eligiblePlayers = Object.keys(players).filter(playerId => playerId !== excludedId)
  if (eligiblePlayers.length === 0) {
    return null
  }
  const randomIndex = Math.floor(Math.random() * eligiblePlayers.length)
  return eligiblePlayers[randomIndex]
}

const getUnitCountsByOwner = (units = []) => {
  return units.reduce((acc, unit) => {
    if (!unit?.ownerID) return acc
    acc[unit.ownerID] = (acc[unit.ownerID] || 0) + 1
    return acc
  }, {})
}

const ensureBattleStats = (game) => {
  if (game.battleStats) return
  const initialCounts = getUnitCountsByOwner((game.units || []).filter((unit) => unit.currentHP > 0))
  game.battleStats = {
    initialUnitCounts: initialCounts,
    firstKill: null,
    retreatCounts: {},
    objectiveCaptures: [],
  }
}

const TRANSPORT_STATS = {
  name: 'Transport',
  image: 'transport',
  maxHP: 40,
  attackPower: 10,
  movePoints: 2,
  range: 1,
}


const MORALE_STATES = {
  LOW: 'LOW',
  NEUTRAL: 'NEUTRAL',
  HIGH: 'HIGH',
}

const GAME_MODES = {
  ELIMINATION: {
    id: 'ELIMINATION',
    name: 'Total Elimination',
    description: 'Eliminate all enemy units to win',
    mapSize: { width: 6, height: 4 },
  },
  ATTACK_DEFEND: {
    id: 'ATTACK_DEFEND',
    name: 'Attack & Defend',
    description: 'Defender must hold Paris for 20 turns. Attacker must capture it.',
    mapSize: { width: 8, height: 6 },
    objectiveHexes: [
      { q: 0, r: 0 }, // Paris center
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
    ],
    turnLimit: 20,
  },
}

const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: false },
  FOREST: { name: 'Forest', defenseBonus: 10, moveCost: 1, passable: true, waterOnly: false },
  CITY: { name: 'City', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  BARRACKS: { name: 'Barracks', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  CASTLE: { name: 'Castle', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  CATHEDRAL: { name: 'Cathedral', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  FARM: { name: 'Farm', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  LIBRARY: { name: 'Library', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  MOSQUE: { name: 'Mosque', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  HOSPITAL: { name: 'Hospital', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  UNIVERSITY: { name: 'University', defenseBonus: 5, moveCost: 1, passable: true, waterOnly: false },
  MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false },
  WALL: { name: 'Wall', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false, maxHP: 100 },
  FLOOR: { name: 'Floor', defenseBonus: 0, moveCost: 0.5, passable: true, waterOnly: false },
  WATER: { name: 'Water', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: true },
  HILLS: { name: 'Hills', defenseBonus: 8, moveCost: 2, passable: true, waterOnly: false },
}

const DAMAGE_VARIANCE = {
  min: 0.8,
  max: 1.2,
}

const SOFT_ZOC_MOVE_PENALTY = 0.5

const ACTION_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ensurePlayersTurn = (playerID, game, actionLabel) => {
  if (playerID !== game.currentPlayer) {
    return NextResponse.json(
      {
        error: `Not Player ${playerID}'s turn to ${actionLabel}. Current player is ${game.currentPlayer}.`
      },
      { status: 409, headers: ACTION_CORS_HEADERS }
    )
  }
  return null
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getTerrainData = (terrainMap, q, r) => {
  const terrainKey = `${sanitizeCoordinate(q)},${sanitizeCoordinate(r)}`
  const terrain = terrainMap[terrainKey] || 'PLAIN'
  return TERRAIN_TYPES[terrain]
}


const KNIGHT_PENALTY_TERRAINS = new Set([
  'CITY',
  'CASTLE',
  'BARRACKS',
  'CATHEDRAL',
  'MOSQUE',
  'HOSPITAL',
  'UNIVERSITY',
  'LIBRARY',
  'FARM',
])

const isKnightPenaltyTerrain = terrainKey => KNIGHT_PENALTY_TERRAINS.has(terrainKey)

const getUnitMoveCost = (unit, terrainData, terrainKey, { embarking, disembarking } = {}) => {
  if (embarking || disembarking) {
    return unit.maxMovePoints
  }

  const catapultType = UNIT_TYPES.CATAPULT?.type || 'CATAPULT'
  const hillsName = TERRAIN_TYPES.HILLS?.name || 'Hills'
  const isCatapult = unit.baseType === catapultType || unit.type === catapultType
  if (isCatapult && terrainData.name === hillsName) {
    return 1
  }

  const knightType = UNIT_TYPES.KNIGHT?.type || 'KNIGHT'
  const isKnight = unit.baseType === knightType || unit.type === knightType
  if (isKnight && isKnightPenaltyTerrain(terrainKey)) {
    return 2
  }

  return terrainData.moveCost
}

const canEmbark = unit => {
  return !unit.isNaval && !unit.isTransport && unit.movePoints >= unit.maxMovePoints
}

const canDisembark = unit => {
  return unit.isTransport && unit.movePoints >= unit.maxMovePoints
}

const applyTransportState = (unit, { resetMovePoints } = {}) => {
  const baseTemplate = UNIT_TYPES[unit.baseType || unit.type]
  const healthRatio = unit.maxHP > 0 ? unit.currentHP / unit.maxHP : 1

  unit.isTransport = true
  unit.isNaval = true
  unit.name = `Transport (${baseTemplate?.name || unit.name})`
  unit.image = TRANSPORT_STATS.image
  unit.maxHP = TRANSPORT_STATS.maxHP
  unit.currentHP = Math.max(1, Math.round(TRANSPORT_STATS.maxHP * healthRatio))
  unit.attackPower = TRANSPORT_STATS.attackPower
  unit.range = TRANSPORT_STATS.range
  unit.maxMovePoints = TRANSPORT_STATS.movePoints
  if (resetMovePoints) {
    unit.movePoints = TRANSPORT_STATS.movePoints
  }
}

const restoreFromTransport = (unit, { resetMovePoints } = {}) => {
  const baseTemplate = UNIT_TYPES[unit.baseType || unit.type]
  if (!baseTemplate) {
    return
  }
  const healthRatio = unit.maxHP > 0 ? unit.currentHP / unit.maxHP : 1

  unit.isTransport = false
  unit.isNaval = baseTemplate.isNaval || false
  unit.name = baseTemplate.name
  unit.image = baseTemplate.image
  unit.maxHP = baseTemplate.maxHP
  unit.currentHP = Math.max(1, Math.round(baseTemplate.maxHP * healthRatio))
  unit.attackPower = baseTemplate.attackPower
  unit.range = baseTemplate.range
  unit.maxMovePoints = baseTemplate.movePoints
  if (resetMovePoints) {
    unit.movePoints = baseTemplate.movePoints
  }
}




const applyTerrainDamage = (game, attacker, targetQ, targetR) => {
  const terrainKey = `${sanitizeCoordinate(targetQ)},${sanitizeCoordinate(targetR)}`
  if ((game.terrainMap[terrainKey] || 'PLAIN') !== 'WALL') {
    return { ok: false, error: 'Target terrain is not destructible' }
  }

  const attackerTerrainKey = `${sanitizeCoordinate(attacker.q)},${sanitizeCoordinate(attacker.r)}`
  const attackerTerrain = game.terrainMap[attackerTerrainKey] || 'PLAIN'
  const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(attacker.type) ? 5 : 0
  const attackerOnPenaltyTerrain = isKnightPenaltyTerrain(attackerTerrain) && attacker.type === 'KNIGHT'
  const terrainDebuffMultiplier = attackerOnPenaltyTerrain ? 0.75 : 1
  const baseDamage = Math.round((attacker.attackPower + hillBonus) * terrainDebuffMultiplier)
  const hpPercentage = attacker.currentHP / attacker.maxHP
  let damageMultiplier = 1.0
  if (hpPercentage > 0.75) damageMultiplier = 1.0
  else if (hpPercentage > 0.5) damageMultiplier = 0.85
  else if (hpPercentage > 0.25) damageMultiplier = 0.70
  else damageMultiplier = 0.50

  const moraleMultiplier = getMoraleMultiplier(attacker.morale)
  const reducedDamage = Math.round(baseDamage * damageMultiplier * moraleMultiplier)
  const { damage, roll } = applyDamageVariance({ game, reducedDamage, defenseBonus: 0 })

  if (!game.terrainHealth || typeof game.terrainHealth !== 'object') game.terrainHealth = {}
  const maxWallHP = TERRAIN_TYPES.WALL.maxHP || 100
  const currentWallHP = game.terrainHealth[terrainKey] ?? maxWallHP
  const nextWallHP = Math.max(0, currentWallHP - damage)
  game.terrainHealth[terrainKey] = nextWallHP

  attacker.hasAttacked = true
  attacker.lastMove = null
  if (attacker.type === 'CATAPULT' && !attacker.isTransport) attacker.hasMovedOrAttacked = true

  game.log.push(`Player ${attacker.ownerID}'s ${attacker.name} damaged wall at (${targetQ}, ${targetR}) for ${damage} (RNG ${roll >= 1 ? '+' : ''}${Math.round((roll - 1) * 100)}%).`)

  if (nextWallHP <= 0) {
    game.terrainMap[terrainKey] = 'FLOOR'
    if (game.tileMap && typeof game.tileMap === 'object') {
      game.tileMap[terrainKey] = '/tiles/floor.png'
    }
    delete game.terrainHealth[terrainKey]
    game.log.push(`Wall at (${targetQ}, ${targetR}) was destroyed and became floor.`)
  }

  return { ok: true }
}
const getRetreatActivationTurn = (mapId = 'MAP_1') => {
  if (mapId === 'MAP_4') return 25
  return mapId === 'MAP_2' ? 13 : 9
}

const getRetreatZoneForPlayer = ({ hexes = [], mapWidth, playerID, teamMode = false }) => {
  if (!Array.isArray(hexes) || hexes.length === 0 || typeof mapWidth !== 'number') {
    return []
  }

  const teamId = teamMode ? getTeamId(playerID) : playerID
  const isLeftSide = teamId === '0' || teamId === 'blue-green'
  const isRightSide = teamId === '1' || teamId === 'red-yellow'
  if (!isLeftSide && !isRightSide) return []

  const leftEdge = -mapWidth
  const rightEdge = mapWidth

  return hexes.filter((hex) => {
    const column = hex.q + Math.floor(hex.r / 2)
    if (isLeftSide) {
      return column <= leftEdge + 1
    }
    return column >= rightEdge - 1
  })
}

const spectatorActionResponse = () => {
  return NextResponse.json(
    { error: 'Spectators cannot perform game actions.' },
    {
      status: 403,
      headers: ACTION_CORS_HEADERS,
    }
  )
}

// Calculate hex distance (cube coordinates)
const hexDistance = (hex1, hex2) => {
  return Math.max(
    Math.abs(hex1.q - hex2.q),
    Math.abs(hex1.r - hex2.r),
    Math.abs(hex1.s - hex2.s)
  )
}

const getHexesInRange = (centerHex, range, allHexes) => {
  return allHexes.filter(hex => {
    const dist = hexDistance(centerHex, hex)
    return dist > 0 && dist <= range
  })
}

// Get neighboring hexes (distance 1)
const getNeighbors = (hex, allHexes) => {
  const directions = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ]
  
  return directions
    .map(dir => ({
      q: hex.q + dir.q,
      r: hex.r + dir.r,
      s: hex.s + dir.s,
    }))
    .filter(neighbor => 
      allHexes.some(h => h.q === neighbor.q && h.r === neighbor.r)
    )
}

// Check if hex is occupied
const isHexOccupied = (q, r, units) => {
  const sanitizedQ = sanitizeCoordinate(q)
  const sanitizedR = sanitizeCoordinate(r)
  if (sanitizedQ === null || sanitizedR === null) return true // Invalid coordinates are treated as occupied
  return units.some(u => u.q === sanitizedQ && u.r === sanitizedR && u.currentHP > 0)
}

// Calculate reachable hexes for a unit (BFS with move points)
const getReachableHexes = (unit, allHexes, units, terrainMap, { teamMode = false } = {}) => {
  const reachable = []
  const bestRemaining = new Map()
  const queue = [{ q: unit.q, r: unit.r, s: unit.s, remainingMove: unit.movePoints }]
  const occupiedUnits = units.filter((u) => u.id !== unit.id)

  bestRemaining.set(`${sanitizeCoordinate(unit.q)},${sanitizeCoordinate(unit.r)}`, unit.movePoints)
  
  while (queue.length > 0) {
    const current = queue.shift()
    
    const neighbors = getNeighbors(current, allHexes)
    
    for (const neighbor of neighbors) {
      const sanitizedNeighborQ = sanitizeCoordinate(neighbor.q)
      const sanitizedNeighborR = sanitizeCoordinate(neighbor.r)
      const key = `${sanitizedNeighborQ},${sanitizedNeighborR}`
      
      if (sanitizedNeighborQ === null || sanitizedNeighborR === null) continue
      
      // Check terrain
      const terrainData = getTerrainData(terrainMap, sanitizedNeighborQ, sanitizedNeighborR)
      const isWater = terrainData.waterOnly
      const isNaval = unit.isNaval || false
      const isTransport = unit.isTransport || false
      const embarking = isWater && !isNaval && !isTransport
      const disembarking = !isWater && isTransport

      if (isWater && !isNaval && !isTransport && !canEmbark(unit)) continue
      if (!isWater && isNaval && !isTransport) continue
      if (disembarking && !canDisembark(unit)) continue
      
      if (!terrainData.passable) continue
      
      const baseMoveCost = getUnitMoveCost(unit, terrainData, terrainMap[`${neighbor.q},${neighbor.r}`] || 'PLAIN', { embarking, disembarking })
      const zocSurcharge = getSoftZoCSurcharge({
        unit,
        fromHex: current,
        targetHex: { q: sanitizedNeighborQ, r: sanitizedNeighborR },
        units: occupiedUnits,
        allHexes,
        teamMode,
      })
      const moveCost = baseMoveCost + zocSurcharge
      const remainingAfterMove = current.remainingMove - moveCost
      
      if (remainingAfterMove < 0) continue
      
      // Check if occupied by any unit
      if (isHexOccupied(sanitizedNeighborQ, sanitizedNeighborR, occupiedUnits)) continue

      const existingRemaining = bestRemaining.get(key)
      if (existingRemaining !== undefined && existingRemaining >= remainingAfterMove) continue

      bestRemaining.set(key, remainingAfterMove)
      reachable.push({ q: sanitizedNeighborQ, r: sanitizedNeighborR, s: -sanitizedNeighborQ - sanitizedNeighborR })
      
      if (remainingAfterMove > 0) {
        queue.push({ ...neighbor, q: sanitizedNeighborQ, r: sanitizedNeighborR, remainingMove: remainingAfterMove })
      }
    }
  }
  
  return reachable
}

const getUnitVisionRange = (unit, terrainMap = {}) => {
  if (!unit) return 0
  const terrainKey = `${sanitizeCoordinate(unit.q)},${sanitizeCoordinate(unit.r)}`
  const terrain = terrainMap[terrainKey] || 'PLAIN'
  if (terrain === 'HILLS') return 5
  if (terrain === 'FOREST') return 2
  return 3
}

const getVisibleHexesForPlayer = (units, hexes, terrainMap, playerID, teamMode) => {
  const visible = new Set()
  const alliedUnits = units.filter(unit => {
    if (!unit || unit.currentHP <= 0) return false
    if (!teamMode) return unit.ownerID === playerID
    return areAllies(unit.ownerID, playerID)
  })

  alliedUnits.forEach(unit => {
    visible.add(`${sanitizeCoordinate(unit.q)},${sanitizeCoordinate(unit.r)}`)
    const range = getUnitVisionRange(unit, terrainMap)
    getHexesInRange(unit, range, hexes).forEach(hex => {
      visible.add(`${sanitizeCoordinate(hex.q)},${sanitizeCoordinate(hex.r)}`)
    })
  })

  return { visible, alliedUnits }
}

const isUnitVisibleToPlayer = (unit, alliedUnits, visibleHexes, terrainMap = {}) => {
  if (!unit || unit.currentHP <= 0) return false
  const unitKey = `${sanitizeCoordinate(unit.q)},${sanitizeCoordinate(unit.r)}`
  if (!visibleHexes.has(unitKey)) return false

  const terrainKey = `${sanitizeCoordinate(unit.q)},${sanitizeCoordinate(unit.r)}`
  const terrain = terrainMap[terrainKey] || 'PLAIN'
  if (terrain !== 'FOREST') return true

  const detectionRange = 2
  return alliedUnits.some(alliedUnit => hexDistance(alliedUnit, unit) <= detectionRange)
}


const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

const getMoraleMultiplier = (morale) => {
  if (morale === MORALE_STATES.LOW) return 0.8
  if (morale === MORALE_STATES.HIGH) return 1.2
  return 1.0
}

const getNextRandomRoll = (game) => {
  const currentSeed = Number.isInteger(game?.rngState) ? game.rngState : 123456789
  const nextSeed = (1664525 * currentSeed + 1013904223) >>> 0
  if (game) game.rngState = nextSeed
  return nextSeed / 4294967296
}

const applyDamageVariance = ({ game, reducedDamage, defenseBonus = 0 }) => {
  const roll = DAMAGE_VARIANCE.min + (getNextRandomRoll(game) * (DAMAGE_VARIANCE.max - DAMAGE_VARIANCE.min))
  const damage = Math.max(1, Math.round(reducedDamage * roll) - defenseBonus)
  return { damage, roll }
}

const isHexInsideEnemyZoC = ({ unit, hex, units = [], allHexes = [], teamMode = false }) => {
  const adjacentHexes = getNeighbors({ q: hex.q, r: hex.r, s: -hex.q - hex.r }, allHexes)
  return adjacentHexes.some((adjacentHex) => {
    const enemyUnit = units.find((u) => u.q === adjacentHex.q && u.r === adjacentHex.r && u.currentHP > 0)
    if (!enemyUnit || enemyUnit.id === unit.id) return false
    if (!canUnitsFight(unit, enemyUnit, teamMode)) return false
    if (enemyUnit.isTransport) return false
    return enemyUnit.range >= 1
  })
}

const getSoftZoCSurcharge = ({ unit, fromHex, targetHex, units = [], allHexes = [], teamMode = false }) => {
  const fromInsideZoC = isHexInsideEnemyZoC({ unit, hex: fromHex, units, allHexes, teamMode })
  if (!fromInsideZoC) return 0
  const targetInsideZoC = isHexInsideEnemyZoC({ unit, hex: targetHex, units, allHexes, teamMode })
  return targetInsideZoC ? SOFT_ZOC_MOVE_PENALTY : 0
}

const getLowestMovementCost = ({ unit, start, target, allHexes, units, terrainMap, teamMode = false }) => {
  const bestCostByHex = new Map()
  const queue = [{ q: start.q, r: start.r, s: -start.q - start.r, cost: 0 }]
  const occupiedUnits = units.filter((u) => u.id !== unit.id)
  bestCostByHex.set(`${start.q},${start.r}`, 0)

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift()
    const currentKey = `${current.q},${current.r}`
    if (bestCostByHex.get(currentKey) !== current.cost) continue
    if (current.q === target.q && current.r === target.r) return current.cost

    const neighbors = getNeighbors(current, allHexes)
    for (const neighbor of neighbors) {
      const key = `${neighbor.q},${neighbor.r}`
      const terrainData = getTerrainData(terrainMap, neighbor.q, neighbor.r)
      const isWater = terrainData.waterOnly
      const isNaval = unit.isNaval || false
      const isTransport = unit.isTransport || false
      const embarking = isWater && !isNaval && !isTransport
      const disembarking = !isWater && isTransport

      if (isWater && !isNaval && !isTransport && !canEmbark(unit)) continue
      if (!isWater && isNaval && !isTransport) continue
      if (disembarking && !canDisembark(unit)) continue
      if (!terrainData.passable) continue
      if (isHexOccupied(neighbor.q, neighbor.r, occupiedUnits)) continue

      const baseMoveCost = getUnitMoveCost(unit, terrainData, terrainMap[key] || 'PLAIN', { embarking, disembarking })
      const zocSurcharge = getSoftZoCSurcharge({ unit, fromHex: current, targetHex: neighbor, units: occupiedUnits, allHexes, teamMode })
      const nextCost = current.cost + baseMoveCost + zocSurcharge
      const existingCost = bestCostByHex.get(key)
      if (existingCost === undefined || nextCost < existingCost) {
        bestCostByHex.set(key, nextCost)
        queue.push({ ...neighbor, cost: nextCost })
      }
    }
  }
  return Infinity
}

const canUnitsFight = (unitA, unitB, teamMode) => {
  if (!unitA || !unitB) return false
  if (teamMode) return !areAllies(unitA.ownerID, unitB.ownerID)
  return unitA.ownerID !== unitB.ownerID
}

const getUnitByPosition = (units, q, r) => {
  return units.find(unit => unit.currentHP > 0 && unit.q === q && unit.r === r)
}

const isUnitEncircled = (unit, units, teamMode) => {
  if (!unit || unit.currentHP <= 0) return false

  for (let i = 0; i < 3; i += 1) {
    const direction = HEX_DIRECTIONS[i]
    const oppositeDirection = { q: -direction.q, r: -direction.r }
    const sideA = getUnitByPosition(units, unit.q + direction.q, unit.r + direction.r)
    const sideB = getUnitByPosition(units, unit.q + oppositeDirection.q, unit.r + oppositeDirection.r)

    if (canUnitsFight(unit, sideA, teamMode) && canUnitsFight(unit, sideB, teamMode)) {
      return true
    }
  }

  return false
}

const normalizeUnitMorale = (units = []) => {
  units.forEach((unit) => {
    if (!unit.moraleBase) {
      unit.moraleBase = unit.morale === MORALE_STATES.HIGH ? MORALE_STATES.HIGH : MORALE_STATES.NEUTRAL
    }
    if (!unit.morale) {
      unit.morale = unit.moraleBase
    }
  })
}

const getEffectiveMorale = (unit, isEncircled) => {
  const moraleBase = unit?.moraleBase ?? MORALE_STATES.NEUTRAL
  if (unit?.isNaval) return moraleBase
  if (!isEncircled) return moraleBase
  return moraleBase === MORALE_STATES.HIGH ? MORALE_STATES.NEUTRAL : MORALE_STATES.LOW
}

const promoteMoraleFromKill = (unit) => {
  if (!unit) return
  if (unit.morale === MORALE_STATES.LOW) {
    unit.moraleBase = MORALE_STATES.NEUTRAL
    return
  }
  if (unit.moraleBase !== MORALE_STATES.HIGH) {
    unit.moraleBase = MORALE_STATES.HIGH
  }
}

const applyEncirclementMorale = (units = [], teamMode = false) => {
  normalizeUnitMorale(units)
  units.forEach((unit) => {
    const encircled = isUnitEncircled(unit, units, teamMode)
    unit.morale = getEffectiveMorale(unit, encircled)
  })
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    console.log('Received request body:', body)
    const { gameId, action: gameAction, payload } = body
    
    // Sanitize and validate inputs
    const sanitizedGameId = sanitizeGameId(gameId)
    const sanitizedAction = sanitizeAction(gameAction)
    
    console.log('Sanitized gameId:', sanitizedGameId, 'Sanitized action:', sanitizedAction)
    
    if (!sanitizedGameId || !sanitizedAction) {
      return NextResponse.json({ 
        error: 'Invalid or missing required fields: gameId and action' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    console.log(`🎮 Action: ${sanitizedAction} for game ${sanitizedGameId}`)
    
    let game
    try {
      game = await getGame(sanitizedGameId)
      if (game?.units) {
        normalizeUnitMorale(game.units)
      }
    } catch (kvError) {
      console.error('❌ KV getGame failed:', kvError)
      return NextResponse.json({ 
        error: 'Database error: Unable to retrieve game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    if (!game) {
      console.log('❌ Game not found:', sanitizedGameId)
      return NextResponse.json({ 
        error: 'Game not found',
        gameId: sanitizedGameId
      }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    const teamMode = Boolean(game.teamMode)
    const maxPlayers = game.maxPlayers || (teamMode ? 4 : 2)
    game.maxPlayers = maxPlayers
    game.attackerId = game.attackerId || (teamMode ? 'blue-green' : '0')
    game.defenderId = game.defenderId || (teamMode ? 'red-yellow' : '1')
    game.inactivePlayers = game.inactivePlayers || []
    if (!game.playersReady) {
      game.playersReady = {}
      for (let i = 0; i < maxPlayers; i += 1) {
        game.playersReady[String(i)] = false
      }
    }
    if (!game.objectiveControl) {
      game.objectiveControl = { [game.attackerId]: 0, [game.defenderId]: 0 }
    }

    if (!game.map4ObjectiveState && game.mapId === 'MAP_4') {
      game.map4ObjectiveState = createMap4ObjectiveState({ terrainMap: game.terrainMap || {}, teamMode: Boolean(game.teamMode) })
    }
    if (!game.spectators) {
      game.spectators = []
    }
    if (!Array.isArray(game.waitlist)) {
      game.waitlist = []
    }
    if (game.waitlist.length > 0 && game.spectators.length > 0) {
      const waitlistIds = new Set(game.waitlist.map((entry) => entry?.id).filter(Boolean))
      game.spectators = game.spectators.filter((spectator) => !waitlistIds.has(spectator?.id))
    }
    if (!game.leaderId && game.players?.['0']) {
      game.leaderId = '0'
    }
    if (typeof game.fogOfWarEnabled !== 'boolean') {
      game.fogOfWarEnabled = false
    }
    if (!Array.isArray(game.retreatedUnits)) {
      game.retreatedUnits = []
    }
    if (!Array.isArray(game.retreatedUnitIds)) {
      game.retreatedUnitIds = []
    }

    if (game.phase === 'battle') {
      if (!game.turnStartedAt || !game.turnTimeLimitSeconds) {
        setTurnTimerForCurrentPlayer(game)
      }
      if (hasTurnTimedOut(game)) {
        const timedOutPlayer = game.currentPlayer
        advanceTurn({ game, endingPlayerID: timedOutPlayer, forcedByTimer: true })
      }
    }
    
    // Handle different game actions
    try {
      switch (gameAction) {
        case 'setFogOfWar': {
          const fogSchema = {
            playerID: { required: true, sanitize: sanitizePlayerID },
          }
          const fogValidation = validatePayload(payload, fogSchema)
          if (fogValidation.error) {
            return NextResponse.json({
              error: 'Invalid payload for setFogOfWar: ' + fogValidation.error
            }, {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const { playerID: fogPlayerID } = fogValidation.sanitized
          if (!fogPlayerID || fogPlayerID === 'spectator' || !isValidPlayerForGame(fogPlayerID, game)) {
            return NextResponse.json({
              error: 'Invalid playerID for setFogOfWar'
            }, {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (game.phase !== 'lobby') {
            return NextResponse.json({
              error: 'Fog of war can only be updated in the lobby'
            }, {
              status: 409,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (game.leaderId && game.leaderId !== fogPlayerID) {
            return NextResponse.json({
              error: 'Only the lobby leader can update fog of war settings'
            }, {
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const enabled = payload?.enabled === true || payload?.enabled === 'true'
          game.fogOfWarEnabled = enabled
          game.log.push(`Fog of war ${enabled ? 'enabled' : 'disabled'} in the lobby.`)
          game.lastUpdate = Date.now()
          break
        }
        case 'claimSlot': {
          const claimSlotSchema = {
            playerID: { required: true, sanitize: sanitizeParticipantID },
            desiredSlot: { required: true },
            playerName: { required: false, sanitize: sanitizePlayerName },
          }

          const claimSlotValidation = validatePayload(payload, claimSlotSchema)
          if (claimSlotValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for claimSlot: ' + claimSlotValidation.error 
            }, { 
              status: 400,
              headers: ACTION_CORS_HEADERS,
            })
          }

          const { playerID: claimPlayerID, desiredSlot, playerName: claimPlayerName } = claimSlotValidation.sanitized
          if (!claimPlayerID) {
            return NextResponse.json({ error: 'Invalid playerID for claimSlot' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const maxPlayers = game.maxPlayers || (teamMode ? 4 : 2)
          const normalizedDesired = String(desiredSlot)
          const desiredIsSpectator = normalizedDesired === 'spectator'
          const desiredIsWaitlist = normalizedDesired === 'waitlist'
          const desiredIndex = Number(normalizedDesired)

          if (!desiredIsSpectator && !desiredIsWaitlist && (!Number.isInteger(desiredIndex) || desiredIndex < 0 || desiredIndex >= maxPlayers)) {
            return NextResponse.json({ error: 'Desired slot is not valid for this lobby' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const existingEntry = game.players?.[claimPlayerID]
          const spectatorIndex = (game.spectators || []).findIndex((spectator) => spectator?.id === claimPlayerID)
          const waitlistIndex = (game.waitlist || []).findIndex((entry) => entry?.id === claimPlayerID)
          const fromSpectator = spectatorIndex >= 0
          const fromWaitlist = waitlistIndex >= 0

          const sourceEntry = existingEntry || (fromSpectator ? game.spectators[spectatorIndex] : null) || (fromWaitlist ? game.waitlist[waitlistIndex] : null)
          if (!sourceEntry) {
            return NextResponse.json({ error: 'Player is not registered in this lobby' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const sourceName = claimPlayerName || sourceEntry.name || `Player ${claimPlayerID}`
          if (existingEntry) delete game.players[claimPlayerID]
          if (fromSpectator) game.spectators.splice(spectatorIndex, 1)
          if (fromWaitlist) game.waitlist.splice(waitlistIndex, 1)

          if (desiredIsSpectator) {
            game.spectators = game.spectators || []
            game.spectators.push({ id: claimPlayerID, name: sourceName, joinTime: Date.now() })
            if (game.leaderId === claimPlayerID) {
              game.leaderId = pickRandomLeader(game.players, claimPlayerID)
            }
          } else if (desiredIsWaitlist) {
            game.waitlist = game.waitlist || []
            game.waitlist.push({ id: claimPlayerID, name: sourceName, joinTime: Date.now() })
            if (game.leaderId === claimPlayerID) {
              game.leaderId = pickRandomLeader(game.players, claimPlayerID)
            }
          } else {
            const desiredSlotId = String(desiredIndex)
            const displaced = game.players?.[desiredSlotId]
            game.players[desiredSlotId] = {
              ...(sourceEntry || {}),
              name: sourceName,
              joinTime: sourceEntry?.joinTime || Date.now(),
              joined: true,
            }
            if (displaced) {
              game.waitlist.push({
                id: desiredSlotId,
                name: displaced.name || `Player ${desiredSlotId}`,
                joinTime: displaced.joinTime || Date.now(),
              })
            }
            if (game.leaderId === claimPlayerID || !game.leaderId) {
              game.leaderId = desiredSlotId
            }
          }

          game.lastUpdate = Date.now()
          break
        }

        case 'moveParticipant': {
          const moveSchema = {
            playerID: { required: true, sanitize: sanitizeParticipantID },
            targetID: { required: true, sanitize: sanitizeParticipantID },
            destination: { required: true },
          }
          const moveValidation = validatePayload(payload, moveSchema)
          if (moveValidation.error) {
            return NextResponse.json({ error: 'Invalid payload for moveParticipant: ' + moveValidation.error }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const { playerID: actingPlayerID, targetID, destination } = moveValidation.sanitized
          const normalizedDestination = String(destination)
          const maxPlayers = game.maxPlayers || (teamMode ? 4 : 2)
          const destinationIsSpectator = normalizedDestination === 'spectator'
          const destinationIsWaitlist = normalizedDestination === 'waitlist'
          const destinationIndex = Number(normalizedDestination)
          if (!destinationIsSpectator && !destinationIsWaitlist && (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex >= maxPlayers)) {
            return NextResponse.json({ error: 'Destination slot is not valid for this lobby' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const isLeader = game.leaderId && game.leaderId === actingPlayerID
          const isSelfMove = actingPlayerID === targetID
          if (!isLeader && !isSelfMove) {
            return NextResponse.json({ error: 'Only the lobby leader can move other participants' }, { status: 403, headers: ACTION_CORS_HEADERS })
          }

          const currentPlayerEntry = game.players?.[targetID]
          const spectatorIndex = (game.spectators || []).findIndex((spectator) => spectator?.id === targetID)
          const waitlistIndex = (game.waitlist || []).findIndex((entry) => entry?.id === targetID)
          const sourceEntry = currentPlayerEntry || (spectatorIndex >= 0 ? game.spectators[spectatorIndex] : null) || (waitlistIndex >= 0 ? game.waitlist[waitlistIndex] : null)
          if (!sourceEntry) {
            return NextResponse.json({ error: 'Target participant was not found in this lobby' }, { status: 404, headers: ACTION_CORS_HEADERS })
          }

          if (currentPlayerEntry) delete game.players[targetID]
          if (spectatorIndex >= 0) game.spectators.splice(spectatorIndex, 1)
          if (waitlistIndex >= 0) game.waitlist.splice(waitlistIndex, 1)

          if (destinationIsSpectator) {
            game.spectators.push({ id: targetID, name: sourceEntry.name || `Player ${targetID}`, joinTime: sourceEntry.joinTime || Date.now() })
            if (game.leaderId === targetID) {
              game.leaderId = pickRandomLeader(game.players, targetID)
            }
          } else if (destinationIsWaitlist) {
            game.waitlist.push({ id: targetID, name: sourceEntry.name || `Player ${targetID}`, joinTime: sourceEntry.joinTime || Date.now() })
            if (game.leaderId === targetID) {
              game.leaderId = pickRandomLeader(game.players, targetID)
            }
          } else {
            const slotId = String(destinationIndex)
            const displaced = game.players?.[slotId]
            game.players[slotId] = {
              ...sourceEntry,
              name: sourceEntry.name || `Player ${slotId}`,
              joinTime: sourceEntry.joinTime || Date.now(),
              joined: true,
            }
            if (displaced) {
              game.waitlist.push({ id: slotId, name: displaced.name || `Player ${slotId}`, joinTime: displaced.joinTime || Date.now() })
            }
            if (!game.leaderId || game.leaderId === targetID) {
              game.leaderId = slotId
            }
          }

          game.lastUpdate = Date.now()
          break
        }

        case 'kickParticipant': {
          const kickSchema = {
            playerID: { required: true, sanitize: sanitizePlayerID },
            targetID: { required: true, sanitize: sanitizeParticipantID },
          }

          const kickValidation = validatePayload(payload, kickSchema)
          if (kickValidation.error) {
            return NextResponse.json({
              error: 'Invalid payload for kickParticipant: ' + kickValidation.error
            }, {
              status: 400,
              headers: ACTION_CORS_HEADERS,
            })
          }

          const { playerID: actingPlayerID, targetID } = kickValidation.sanitized

          if (!actingPlayerID || actingPlayerID === 'spectator' || !isValidPlayerForGame(actingPlayerID, game)) {
            return NextResponse.json({
              error: 'Invalid playerID for kickParticipant'
            }, {
              status: 400,
              headers: ACTION_CORS_HEADERS,
            })
          }

          if (game.phase !== 'lobby') {
            return NextResponse.json({
              error: 'Players can only be kicked while in the lobby'
            }, {
              status: 409,
              headers: ACTION_CORS_HEADERS,
            })
          }

          if (!game.leaderId || game.leaderId !== actingPlayerID) {
            return NextResponse.json({
              error: 'Only the lobby leader can kick participants'
            }, {
              status: 403,
              headers: ACTION_CORS_HEADERS,
            })
          }

          const targetIsPlayer = Boolean(game.players?.[targetID])
          const targetSpectatorIndex = (game.spectators || []).findIndex(spectator => spectator?.id === targetID)
          const targetWaitlistIndex = (game.waitlist || []).findIndex(entry => entry?.id === targetID)

          if (!targetIsPlayer && targetSpectatorIndex === -1 && targetWaitlistIndex === -1) {
            return NextResponse.json({
              error: 'Kick target was not found in this lobby'
            }, {
              status: 404,
              headers: ACTION_CORS_HEADERS,
            })
          }

          if (targetIsPlayer) {
            const targetName = game.players[targetID]?.name || `Player ${targetID}`
            delete game.players[targetID]

            if (game.leaderId === targetID) {
              game.leaderId = pickRandomLeader(game.players, targetID)
            }

            game.log.push(`${targetName} was kicked from the lobby.`)
          } else if (targetSpectatorIndex >= 0) {
            const [removedSpectator] = game.spectators.splice(targetSpectatorIndex, 1)
            const spectatorName = removedSpectator?.name || 'Spectator'
            game.log.push(`${spectatorName} was kicked from spectators.`)
          } else {
            const [removedWaitlist] = game.waitlist.splice(targetWaitlistIndex, 1)
            const waitlistName = removedWaitlist?.name || 'Participant'
            game.log.push(`${waitlistName} was kicked from waitlist.`)
          }

          game.lastUpdate = Date.now()
          break
        }

        case 'startBattle': {
          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for startBattle: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const startPlayerID = sanitizePlayerID(payload.playerID)
          if (!startPlayerID || startPlayerID === 'spectator') {
            return NextResponse.json({ 
              error: 'Invalid playerID for startBattle' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (!isValidPlayerForGame(startPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (game.leaderId && game.leaderId !== startPlayerID) {
            return NextResponse.json({ 
              error: 'Only the lobby leader can start the battle' 
            }, { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (game.phase === 'lobby') {
            const playOrder = getGamePlayOrder(game)
            const activePlayers = playOrder.filter(id => game.players?.[id])
            if (activePlayers.length < 2) {
              return NextResponse.json({ 
                error: 'At least two players must be in the lobby to start the match' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
            game.phase = 'setup'
            game.currentPlayer = activePlayers[0] || playOrder[0] || '0'
            game.log.push('🧭 Match started! Deploy units to begin the siege.')
            game.lastUpdate = Date.now()
            break
          }

          const playOrder = getGamePlayOrder(game)
          const activePlayers = playOrder.filter(id =>
            game.units.some(unit => unit.ownerID === id)
          )
          if (activePlayers.length < 2) {
            return NextResponse.json({ 
              error: 'At least two players need units to start the battle' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          game.phase = 'battle'
          ensureBattleStats(game)
          game.inactivePlayers = playOrder.filter(id => !activePlayers.includes(id))
          game.currentPlayer = activePlayers[0] || '0'
          game.log.push(`⚔️ BATTLE PHASE BEGINS! Player ${game.currentPlayer} gets the first turn.`)
          setTurnTimerForCurrentPlayer(game)
          game.lastUpdate = Date.now()
          break
        }

        case 'placeUnit':
          // Validate and sanitize payload
          const placeUnitSchema = {
            unitType: { required: true, sanitize: sanitizeUnitType },
            q: { required: true, sanitize: sanitizeCoordinate },
            r: { required: true, sanitize: sanitizeCoordinate },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }
          
          const placeUnitValidation = validatePayload(payload, placeUnitSchema)
          if (placeUnitValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for placeUnit: ' + placeUnitValidation.error 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const { unitType, q, r, playerID: placePlayerID } = placeUnitValidation.sanitized

          if (placePlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (game.phase !== 'setup') {
            return NextResponse.json({ 
              error: 'Units can only be placed during the setup phase' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (!isValidPlayerForGame(placePlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Unit placement logic
          const stats = UNIT_TYPES[unitType]
          if (!stats) {
            return NextResponse.json({ 
              error: 'Invalid unit type: ' + unitType 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const terrainData = getTerrainData(game.terrainMap, q, r)
          
          if (stats.isNaval && !terrainData.waterOnly) {
            return NextResponse.json({ 
              error: 'Naval units can only be placed on water tiles' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Check spawn zone restriction
          const mapWidth = game.mapSize?.width || 6
          const inSpawnZone = isInSpawnZone(q, r, placePlayerID, mapWidth, teamMode, game.deploymentZones)
          if (!inSpawnZone) {
            return NextResponse.json({ 
              error: 'Units can only be placed in your spawn zone' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Check if hex is already occupied
          const isOccupied = game.units.some(u => u.q === q && u.r === r && u.currentHP > 0)
          if (isOccupied) {
            return NextResponse.json({ 
              error: 'Hex is already occupied by another unit' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const newUnit = {
            id: Date.now().toString(),
            type: unitType,
            baseType: unitType,
            name: stats.name,
            image: stats.image,
            ownerID: placePlayerID,
            q: q,
            r: r,
            s: -q - r,
            currentHP: stats.maxHP,
            maxHP: stats.maxHP,
            attackPower: stats.attackPower,
            movePoints: stats.movePoints,
            maxMovePoints: stats.movePoints,
            range: stats.range,
            isNaval: stats.isNaval || false,
            isTransport: false,
            hasMoved: false,
            hasAttacked: false,
            hasMovedOrAttacked: false, // For catapult move-or-attack restriction
            lastMove: null,
            morale: MORALE_STATES.NEUTRAL,
            moraleBase: MORALE_STATES.NEUTRAL
          }
          
          if (terrainData.waterOnly && !newUnit.isNaval) {
            applyTransportState(newUnit, { resetMovePoints: true })
          }
          
          game.units.push(newUnit)
          applyEncirclementMorale(game.units, teamMode)
          game.log.push(`Player ${placePlayerID} placed ${newUnit.name} at (${q}, ${r})`)
          game.lastUpdate = Date.now()
          break
          
        case 'removeUnit':
          // Validate and sanitize payload
          const removeUnitSchema = {
            unitId: { required: true, sanitize: sanitizeUnitId },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }
          
          const removeUnitValidation = validatePayload(payload, removeUnitSchema)
          if (removeUnitValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for removeUnit: ' + removeUnitValidation.error 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const { unitId: removeUnitId, playerID: removePlayerID } = removeUnitValidation.sanitized

          if (removePlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (game.phase !== 'setup') {
            return NextResponse.json({ 
              error: 'Units can only be removed during the setup phase' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (!isValidPlayerForGame(removePlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Find and remove the unit (only allow removing own units)
          const unitToRemove = game.units.find(u => u.id === removeUnitId)
          if (!unitToRemove) {
            return NextResponse.json({ 
              error: 'Unit not found: ' + removeUnitId 
            }, { 
              status: 404,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          if (unitToRemove.ownerID !== removePlayerID) {
            return NextResponse.json({ 
              error: 'Cannot remove unit owned by another player' 
            }, { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.units = game.units.filter(u => u.id !== removeUnitId)
          applyEncirclementMorale(game.units, teamMode)
          game.log.push(`Player ${removePlayerID} removed ${unitToRemove.name} at (${unitToRemove.q}, ${unitToRemove.r})`)
          game.lastUpdate = Date.now()
          break
          
        case 'selectUnit':
          if (!payload?.unitId) {
            return NextResponse.json({ 
              error: 'Missing required field for selectUnit: unitId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const selectPlayerID = sanitizePlayerID(payload?.playerID)
          if (selectPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!selectPlayerID || !isValidPlayerForGame(selectPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for selectUnit' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.selectedUnitId = payload.unitId
          break
          
        case 'deselectUnit':
          const deselectPlayerID = sanitizePlayerID(payload?.playerID)
          if (deselectPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!deselectPlayerID || !isValidPlayerForGame(deselectPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for deselectUnit' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          game.selectedUnitId = null
          break
          
        case 'moveUnit':
          // Validate and sanitize payload
          const moveUnitSchema = {
            unitId: { required: true, sanitize: sanitizeUnitId },
            targetQ: { required: true, sanitize: sanitizeCoordinate },
            targetR: { required: true, sanitize: sanitizeCoordinate },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }
          
          const moveUnitValidation = validatePayload(payload, moveUnitSchema)
          if (moveUnitValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for moveUnit: ' + moveUnitValidation.error 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const { unitId, targetQ, targetR, playerID: movePlayerID } = moveUnitValidation.sanitized

          if (movePlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!isValidPlayerForGame(movePlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const moveTurnError = ensurePlayersTurn(movePlayerID, game, 'move')
          if (moveTurnError) {
            return moveTurnError
          }
          
          const movingUnit = game.units.find(u => u.id === unitId)
          if (movingUnit && movingUnit.ownerID !== movePlayerID) {
            return NextResponse.json({ 
              error: 'Cannot move a unit you do not own' 
            }, { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          if (movingUnit && movingUnit.movePoints > 0) {
            // Catapult move-or-attack restriction
            if (movingUnit.type === 'CATAPULT' && !movingUnit.isTransport && movingUnit.hasMovedOrAttacked) {
              return NextResponse.json({ 
                error: 'Catapult cannot move after attacking this turn' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
            
            // Calculate reachable hexes with proper move points
            const reachable = getReachableHexes(movingUnit, game.hexes, game.units, game.terrainMap, { teamMode })
            const isReachable = reachable.some(h => h.q === targetQ && h.r === targetR)
            
            if (!isReachable) {
              return NextResponse.json({ 
                error: 'Target hex is not reachable with current movement points' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }

            const targetTerrain = getTerrainData(game.terrainMap, targetQ, targetR)
            const isEmbarkMove = targetTerrain.waterOnly && !movingUnit.isNaval && !movingUnit.isTransport
            const isDisembarkMove = !targetTerrain.waterOnly && movingUnit.isTransport

            if (isEmbarkMove && !canEmbark(movingUnit)) {
              return NextResponse.json({ 
                error: 'Unit must have full movement points to embark' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }

            if (isDisembarkMove && !canDisembark(movingUnit)) {
              return NextResponse.json({ 
                error: 'Unit must have full movement points to disembark' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
            
            const actualCost = getLowestMovementCost({
              unit: movingUnit,
              start: { q: movingUnit.q, r: movingUnit.r },
              target: { q: targetQ, r: targetR },
              allHexes: game.hexes,
              units: game.units,
              terrainMap: game.terrainMap,
              teamMode,
            })
            
            movingUnit.lastMove = {
              q: movingUnit.q,
              r: movingUnit.r,
              s: movingUnit.s,
              movePoints: movingUnit.movePoints,
              hasMoved: movingUnit.hasMoved,
              hasMovedOrAttacked: movingUnit.hasMovedOrAttacked
            }

            // Move the unit
            movingUnit.q = sanitizeCoordinate(targetQ)
            movingUnit.r = sanitizeCoordinate(targetR)
            movingUnit.s = -sanitizeCoordinate(targetQ) - sanitizeCoordinate(targetR)
            movingUnit.movePoints -= actualCost

            if (isEmbarkMove) {
              applyTransportState(movingUnit)
              movingUnit.movePoints = 0
              movingUnit.hasMoved = true
              movingUnit.hasAttacked = true
            } else if (isDisembarkMove) {
              restoreFromTransport(movingUnit)
              movingUnit.movePoints = 0
              movingUnit.hasMoved = true
              movingUnit.hasAttacked = true
            } else {
              movingUnit.hasMoved = movingUnit.movePoints <= 0 // Mark as moved if no movement points left
            }
            
            // Catapult move-or-attack restriction
            if (movingUnit.type === 'CATAPULT' && !movingUnit.isTransport) {
              movingUnit.hasMovedOrAttacked = true
            }
            
            game.log.push(`Player ${movePlayerID}'s ${movingUnit.name} moved to (${sanitizeCoordinate(targetQ)}, ${sanitizeCoordinate(targetR)})`)
            applyEncirclementMorale(game.units, teamMode)
            game.lastUpdate = Date.now()
          } else {
            return NextResponse.json({ 
              error: 'Unit not found or no movement points available' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          break

        case 'undoMove':
          // Validate and sanitize payload
          const undoMoveSchema = {
            unitId: { required: true, sanitize: sanitizeUnitId },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }

          const undoMoveValidation = validatePayload(payload, undoMoveSchema)
          if (undoMoveValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for undoMove: ' + undoMoveValidation.error 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const { unitId: undoUnitId, playerID: undoPlayerID } = undoMoveValidation.sanitized

          if (undoPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!isValidPlayerForGame(undoPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const undoTurnError = ensurePlayersTurn(undoPlayerID, game, 'undo a move')
          if (undoTurnError) {
            return undoTurnError
          }
          const undoUnit = game.units.find(u => u.id === undoUnitId)

          if (!undoUnit || undoUnit.ownerID !== undoPlayerID) {
            return NextResponse.json({ 
              error: 'Unit not found or not owned by player' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (undoUnit.hasAttacked || !undoUnit.lastMove) {
            return NextResponse.json({ 
              error: 'Cannot undo move after attacking or without a previous move' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          undoUnit.q = undoUnit.lastMove.q
          undoUnit.r = undoUnit.lastMove.r
          undoUnit.s = undoUnit.lastMove.s
          undoUnit.movePoints = undoUnit.lastMove.movePoints
          undoUnit.hasMoved = undoUnit.lastMove.hasMoved
          undoUnit.hasMovedOrAttacked = undoUnit.lastMove.hasMovedOrAttacked
          undoUnit.lastMove = null

          game.log.push(`Player ${undoPlayerID}'s ${undoUnit.name} undid their move.`)
          game.lastUpdate = Date.now()
          break
          
        case 'attackTerrain':
          const attackTerrainSchema = {
            attackerId: { required: true, sanitize: sanitizeUnitId },
            targetQ: { required: true, sanitize: sanitizeCoordinate },
            targetR: { required: true, sanitize: sanitizeCoordinate },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }

          const attackTerrainValidation = validatePayload(payload, attackTerrainSchema)
          if (attackTerrainValidation.error) {
            return NextResponse.json({ error: 'Invalid payload for attackTerrain: ' + attackTerrainValidation.error }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const { attackerId: terrainAttackerId, targetQ: terrainTargetQ, targetR: terrainTargetR, playerID: terrainPlayerID } = attackTerrainValidation.sanitized
          if (terrainPlayerID === 'spectator') return spectatorActionResponse()
          if (!isValidPlayerForGame(terrainPlayerID, game)) return NextResponse.json({ error: 'Invalid playerID for this lobby' }, { status: 400, headers: ACTION_CORS_HEADERS })
          const terrainTurnError = ensurePlayersTurn(terrainPlayerID, game, 'attack terrain')
          if (terrainTurnError) return terrainTurnError

          const terrainAttacker = game.units.find(u => u.id === terrainAttackerId)
          if (!terrainAttacker || terrainAttacker.ownerID !== terrainPlayerID || terrainAttacker.hasAttacked) {
            return NextResponse.json({ error: 'Attack failed (unit not found or already attacked)' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          if (terrainAttacker.type === 'CATAPULT' && !terrainAttacker.isTransport && terrainAttacker.hasMovedOrAttacked) {
            return NextResponse.json({ error: 'Catapult cannot attack after moving this turn' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const terrainDistance = Math.max(
            Math.abs(terrainAttacker.q - terrainTargetQ),
            Math.abs(terrainAttacker.r - terrainTargetR),
            Math.abs(terrainAttacker.s - (-terrainTargetQ - terrainTargetR))
          )
          if (terrainDistance > terrainAttacker.range) {
            return NextResponse.json({ error: 'Target terrain is out of range' }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          const terrainAttackResult = applyTerrainDamage(game, terrainAttacker, terrainTargetQ, terrainTargetR)
          if (!terrainAttackResult.ok) {
            return NextResponse.json({ error: terrainAttackResult.error }, { status: 400, headers: ACTION_CORS_HEADERS })
          }

          applyEncirclementMorale(game.units, teamMode)
          game.lastUpdate = Date.now()
          break

        case 'attackUnit':
          if (!payload?.attackerId || !payload?.targetId) {
            return NextResponse.json({ 
              error: 'Missing required fields for attackUnit: attackerId, targetId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for attackUnit: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const attackPlayerID = sanitizePlayerID(payload?.playerID)
          if (attackPlayerID === 'spectator') {
            return spectatorActionResponse()
          }
          if (payload?.playerID && !attackPlayerID) {
            return NextResponse.json({ 
              error: 'Invalid playerID for attackUnit' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (attackPlayerID && !isValidPlayerForGame(attackPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const attackTurnError = ensurePlayersTurn(attackPlayerID, game, 'attack')
          if (attackTurnError) {
            return attackTurnError
          }
          
          const attacker = game.units.find(u => u.id === payload.attackerId)
          const target = game.units.find(u => u.id === payload.targetId)
          
          if (!attacker || !target) {
            return NextResponse.json({ 
              error: 'Invalid attacker or target unit' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (attackPlayerID && attacker.ownerID !== attackPlayerID) {
            return NextResponse.json({ 
              error: 'Cannot attack with a unit you do not own' 
            }, { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (teamMode ? areAllies(attacker.ownerID, target.ownerID) : attacker.ownerID === target.ownerID) {
            return NextResponse.json({ 
              error: 'Cannot attack allied units' 
            }, { 
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (game.fogOfWarEnabled) {
            const { visible, alliedUnits } = getVisibleHexesForPlayer(
              game.units,
              game.hexes,
              game.terrainMap,
              attackPlayerID,
              teamMode
            )
            if (!isUnitVisibleToPlayer(target, alliedUnits, visible, game.terrainMap)) {
              return NextResponse.json({
                error: 'Target is not visible due to fog of war'
              }, {
                status: 409,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
          }

          if (!attacker.hasAttacked) {
            // Catapult move-or-attack restriction
            if (attacker.type === 'CATAPULT' && !attacker.isTransport && attacker.hasMovedOrAttacked) {
              return NextResponse.json({ 
                error: 'Catapult cannot attack after moving this turn' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
            // Calculate terrain defense bonus for target
            const targetTerrainKey = `${sanitizeCoordinate(target.q)},${sanitizeCoordinate(target.r)}`
            const targetTerrain = game.terrainMap[targetTerrainKey] || 'PLAIN'
            const terrainData = TERRAIN_TYPES[targetTerrain]
            const defenseBonus = terrainData.defenseBonus || 0
            
            const attackerTerrainKey = `${sanitizeCoordinate(attacker.q)},${sanitizeCoordinate(attacker.r)}`
            const attackerTerrain = game.terrainMap[attackerTerrainKey] || 'PLAIN'
            const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(attacker.type)
              ? 5
              : 0
            const attackerOnPenaltyTerrain = isKnightPenaltyTerrain(attackerTerrain) && attacker.type === 'KNIGHT'
            const terrainDebuffMultiplier = attackerOnPenaltyTerrain ? 0.75 : 1
            const baseDamage = Math.round((attacker.attackPower + hillBonus) * terrainDebuffMultiplier)
            
            // Calculate damage reduction based on HP percentage
            const hpPercentage = attacker.currentHP / attacker.maxHP
            let damageMultiplier = 1.0
            
            if (hpPercentage > 0.75) {
              damageMultiplier = 1.0 // 100% damage
            } else if (hpPercentage > 0.5) {
              damageMultiplier = 0.85 // 85% damage
            } else if (hpPercentage > 0.25) {
              damageMultiplier = 0.70 // 70% damage
            } else {
              damageMultiplier = 0.50 // 50% damage
            }
            
            const attackerMoraleMultiplier = getMoraleMultiplier(attacker.morale)
            const reducedDamage = Math.round(baseDamage * damageMultiplier * attackerMoraleMultiplier)
            const { damage: actualDamage, roll: attackRoll } = applyDamageVariance({ game, reducedDamage, defenseBonus })
            
            target.currentHP -= actualDamage
            attacker.hasAttacked = true
            attacker.lastMove = null
            
            // Catapult move-or-attack restriction
            if (attacker.type === 'CATAPULT' && !attacker.isTransport) {
              attacker.hasMovedOrAttacked = true
            }
            
            game.log.push(`Player ${attackPlayerID || payload.playerID}'s ${attacker.name} hit ${target.name} for ${actualDamage} damage (RNG ${attackRoll >= 1 ? '+' : ''}${Math.round((attackRoll - 1) * 100)}%)${damageMultiplier < 1.0 ? ` (reduced to ${Math.round(damageMultiplier * 100)}% due to wounds)` : ''}${attackerMoraleMultiplier !== 1.0 ? ` (${attackerMoraleMultiplier > 1 ? '+20%' : '-20%'} morale)` : ''}${defenseBonus > 0 ? ` (terrain defense +${defenseBonus})` : ''}!`)
            
            // Counter-attack logic (if target survives and is in range)
            if (target.currentHP > 0) {
              const distance = Math.max(
                Math.abs(attacker.q - target.q),
                Math.abs(attacker.r - target.r),
                Math.abs(attacker.s - target.s)
              )
              
              if (distance <= target.range) {
                // Calculate attacker's terrain defense bonus for counter-attack
                const attackerTerrainKey = `${sanitizeCoordinate(attacker.q)},${sanitizeCoordinate(attacker.r)}`
                const attackerTerrain = game.terrainMap[attackerTerrainKey] || 'PLAIN'
                const attackerTerrainData = TERRAIN_TYPES[attackerTerrain]
                const attackerDefenseBonus = attackerTerrainData.defenseBonus || 0
                
                // Apply damage reduction to counter-attack based on target's HP
                const targetHpPercentage = target.currentHP / target.maxHP
                let targetDamageMultiplier = 1.0
                
                if (targetHpPercentage > 0.75) {
                  targetDamageMultiplier = 1.0 // 100% damage
                } else if (targetHpPercentage > 0.5) {
                  targetDamageMultiplier = 0.85 // 85% damage
                } else if (targetHpPercentage > 0.25) {
                  targetDamageMultiplier = 0.70 // 70% damage
                } else {
                  targetDamageMultiplier = 0.50 // 50% damage
                }
                
                const targetBaseDamage = target.attackPower
                
                // Catapults cannot counter-attack (siege weapons)
                if (target.type === 'CATAPULT' && !target.isTransport) {
                  game.log.push(`${target.name} cannot counter-attack (siege weapon)!`)
                } else {
                  // Archer melee penalty: 50% less damage in melee combat
                  let meleePenaltyMultiplier = 1.0
                  if (target.type === 'ARCHER' && distance === 1) {
                    meleePenaltyMultiplier = 0.5 // 50% damage reduction in melee
                  }
                  
                  const targetMoraleMultiplier = getMoraleMultiplier(target.morale)
                  const targetReducedDamage = Math.round(targetBaseDamage * targetDamageMultiplier * meleePenaltyMultiplier * targetMoraleMultiplier)
                  const { damage: counterDamage, roll: counterRoll } = applyDamageVariance({ game, reducedDamage: targetReducedDamage, defenseBonus: attackerDefenseBonus })
                  attacker.currentHP -= counterDamage
                  
                  game.log.push(`${target.name} counter-attacked for ${counterDamage} damage (RNG ${counterRoll >= 1 ? '+' : ''}${Math.round((counterRoll - 1) * 100)}%)${targetDamageMultiplier < 1.0 ? ` (reduced to ${Math.round(targetDamageMultiplier * 100)}% due to wounds)` : ''}${targetMoraleMultiplier !== 1.0 ? ` (${targetMoraleMultiplier > 1 ? '+20%' : '-20%'} morale)` : ''}${meleePenaltyMultiplier < 1.0 ? ` (melee penalty -50%)` : ''}${attackerDefenseBonus > 0 ? ` (terrain defense +${attackerDefenseBonus})` : ''}!`)
                  
                  if (attacker.currentHP <= 0) {
                    promoteMoraleFromKill(target)
                    game.units = game.units.filter(u => u.id !== attacker.id)
                    game.log.push(`${attacker.name} was defeated by counter-attack!`)
                  }
                }
              }
            }
            
            if (target.currentHP <= 0) {
              promoteMoraleFromKill(attacker)
              if (game.battleStats && !game.battleStats.firstKill) {
                game.battleStats.firstKill = {
                  attacker: attacker.ownerID,
                  victim: target.ownerID,
                  unit: target.name,
                  turn: game.turn || 1,
                }
              }
              game.units = game.units.filter(u => u.id !== target.id)
              game.log.push(`${target.name} was defeated!`)
            }

            applyEncirclementMorale(game.units, teamMode)
            game.lastUpdate = Date.now()
          } else {
            return NextResponse.json({ 
              error: 'Attack failed (unit not found or already attacked)' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          break
          
        case 'sendChat':
          const chatSchema = {
            message: { required: true, sanitize: sanitizeChatMessage },
            playerID: { required: true, sanitize: sanitizePlayerID },
            playerName: { required: false, sanitize: sanitizePlayerName }
          }

          const chatValidation = validatePayload(payload, chatSchema)
          if (chatValidation.error) {
            return NextResponse.json({
              error: 'Invalid payload for sendChat: ' + chatValidation.error
            }, {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const {
            message: sanitizedMessage,
            playerID: chatPlayerID,
            playerName: chatPlayerName
          } = chatValidation.sanitized

          if (!sanitizedMessage) {
            return NextResponse.json({
              error: 'Chat message cannot be empty'
            }, {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const senderLabel = chatPlayerName
            ? chatPlayerName
            : chatPlayerID === 'spectator'
              ? 'Spectator'
              : `Player ${chatPlayerID}`

          const chatEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sender: senderLabel,
            playerID: chatPlayerID,
            message: sanitizedMessage,
            timestamp: Date.now()
          }

          game.chatMessages = [...(game.chatMessages || []), chatEntry].slice(-6)
          game.lastUpdate = Date.now()
          break

        case 'endTurn':
          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for endTurn: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const endTurnPlayerID = sanitizePlayerID(payload.playerID)
          if (!endTurnPlayerID) {
            return NextResponse.json({ 
              error: 'Invalid playerID for endTurn' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (endTurnPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!isValidPlayerForGame(endTurnPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const endTurnError = ensurePlayersTurn(endTurnPlayerID, game, 'end their turn')
          if (endTurnError) {
            return endTurnError
          }
          
          advanceTurn({ game, endingPlayerID: endTurnPlayerID })
          break
          
        case 'readyForBattle':
          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for readyForBattle: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const readyPlayerID = sanitizePlayerID(payload.playerID)
          if (!readyPlayerID) {
            return NextResponse.json({ 
              error: 'Invalid playerID for readyForBattle' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (readyPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (game.phase !== 'setup') {
            return NextResponse.json({ 
              error: 'Players can only ready up during the setup phase' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          if (!isValidPlayerForGame(readyPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.playersReady[readyPlayerID] = true
          game.log.push(`Player ${readyPlayerID} is ready for battle!`)

          const readyPlayOrder = getGamePlayOrder(game)
          const readyLobbyPlayers = readyPlayOrder.filter(id => game.players?.[id])
          const readyEligiblePlayers = readyLobbyPlayers.length > 0 ? readyLobbyPlayers : readyPlayOrder
          const readyActivePlayers = readyEligiblePlayers.filter(id =>
            game.units.some(unit => unit.ownerID === id && unit.currentHP > 0)
          )
          const readyPlayers = readyEligiblePlayers.filter(id => game.playersReady[id])

          if (
            readyEligiblePlayers.length >= 2 &&
            readyPlayers.length === readyEligiblePlayers.length &&
            readyActivePlayers.length === readyEligiblePlayers.length
          ) {
            game.phase = 'battle'
            ensureBattleStats(game)
            game.inactivePlayers = readyPlayOrder.filter(id => !readyActivePlayers.includes(id))
            game.currentPlayer = readyActivePlayers[0] || readyEligiblePlayers[0] || '0'
            game.log.push(`⚔️ BATTLE PHASE BEGINS! Player ${game.currentPlayer} gets the first turn.`)
            setTurnTimerForCurrentPlayer(game)
          } else {
            // Auto end turn after ready for battle in setup phase
            const turnOrder = readyEligiblePlayers.length > 0 ? readyEligiblePlayers : readyPlayOrder
            const currentIndex = Math.max(0, turnOrder.indexOf(game.currentPlayer))
            const nextIndex = (currentIndex + 1) % turnOrder.length
            game.currentPlayer = turnOrder[nextIndex]
            game.log.push(`Player ${readyPlayerID} is ready. Turn passes to Player ${game.currentPlayer}.`)
          }
          game.lastUpdate = Date.now()
          break
          
        case 'toggleRetreatMode':
          // Only allow retreat once map threshold is reached
          const activationTurn = getRetreatActivationTurn(game.mapId)
          if (game.turn >= activationTurn) {
            game.retreatModeActive = !game.retreatModeActive
            game.log.push(game.retreatModeActive ? '🚨 Retreat mode ACTIVATED!' : 'Retreat mode deactivated.')
          }
          game.lastUpdate = Date.now()
          break
          
        case 'retreatUnit':
          // Validate and sanitize payload
          const retreatUnitSchema = {
            unitId: { required: true, sanitize: sanitizeUnitId },
            playerID: { required: true, sanitize: sanitizePlayerID }
          }
          
          const retreatUnitValidation = validatePayload(payload, retreatUnitSchema)
          if (retreatUnitValidation.error) {
            return NextResponse.json({ 
              error: 'Invalid payload for retreatUnit: ' + retreatUnitValidation.error 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const { unitId: retreatUnitId, playerID: retreatPlayerID } = retreatUnitValidation.sanitized

          if (retreatPlayerID === 'spectator') {
            return spectatorActionResponse()
          }

          if (!isValidPlayerForGame(retreatPlayerID, game)) {
            return NextResponse.json({ 
              error: 'Invalid playerID for this lobby' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const retreatTurnError = ensurePlayersTurn(retreatPlayerID, game, 'retreat')
          if (retreatTurnError) {
            return retreatTurnError
          }

          const retreatTurn = getRetreatActivationTurn(game.mapId)
          if ((game.turn || 1) < retreatTurn) {
            return NextResponse.json({
              error: `Retreat is available from turn ${retreatTurn}`
            }, {
              status: 400,
              headers: ACTION_CORS_HEADERS,
            })
          }
          
          const unit = game.units.find(u => u.id === retreatUnitId)
          
          if (!unit || unit.ownerID !== retreatPlayerID) {
            return NextResponse.json({ 
              error: 'Invalid unit or ownership' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }

          const retreatHexes = getRetreatZoneForPlayer({
            hexes: game.hexes,
            mapWidth: game?.mapSize?.width || 6,
            playerID: retreatPlayerID,
            teamMode: game.teamMode,
          })
          const isInRetreatZone = retreatHexes.some(h => h.q === unit.q && h.r === unit.r)
          if (!isInRetreatZone) {
            return NextResponse.json({ 
              error: 'Unit must be standing in your retreat zone' 
            }, { 
              status: 400,
              headers: ACTION_CORS_HEADERS,
            })
          }
          
          // Remove unit (retreat successful)
          const unitIndex = game.units.findIndex(u => u.id === retreatUnitId)
          if (unitIndex < 0) {
            return NextResponse.json({
              error: 'Unit not found for retreat',
            }, {
              status: 404,
              headers: ACTION_CORS_HEADERS,
            })
          }
          game.retreatedUnits = game.retreatedUnits || []
          game.retreatedUnitIds = game.retreatedUnitIds || []
          game.retreatedUnits.push({ ...unit, retreated: true })
          game.retreatedUnitIds.push(unit.id)
          if (game.battleStats) {
            game.battleStats.retreatCounts = game.battleStats.retreatCounts || {}
            game.battleStats.retreatCounts[retreatPlayerID] = (game.battleStats.retreatCounts[retreatPlayerID] || 0) + 1
          }
          game.units.splice(unitIndex, 1)
          if (game.selectedUnitId === retreatUnitId) {
            game.selectedUnitId = null
          }
          
          game.log.push(`Player ${retreatPlayerID}'s ${unit.name} successfully retreated!`)
          game.lastUpdate = Date.now()
          break
          
        default:
          return NextResponse.json({ 
            error: 'Unknown action: ' + gameAction 
          }, { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          })
      }
    } catch (actionError) {
      console.error('❌ Action processing error:', actionError)
      return NextResponse.json({ 
        error: 'Action processing failed',
        details: actionError.message
      }, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Check victory conditions after each action
    if (game.phase === 'battle') {
      const aliveUnits = game.units.filter(u => u.currentHP > 0)
      const p0Alive = aliveUnits.filter(u => u.ownerID === '0').length
      const p1Alive = aliveUnits.filter(u => u.ownerID === '1').length
      const teamBlueGreenAlive = aliveUnits.filter(u => getTeamId(u.ownerID) === 'blue-green').length
      const teamRedYellowAlive = aliveUnits.filter(u => getTeamId(u.ownerID) === 'red-yellow').length
      
      let victoryInfo = null

      if (game.map4ObjectiveState?.enabled) {
        victoryInfo = getMap4VictoryInfo({ G: game, teamMode, turn: game.turn || 1 })
      }
      
      // Attack & Defend mode victory conditions
      if (!victoryInfo && game.gameMode === 'ATTACK_DEFEND') {
        // Defender (Player 1) wins if they hold objective for required turns
        if (game.objectiveControl[game.defenderId] >= game.turnLimit) {
          victoryInfo = {
            winner: game.defenderId,
            winnerTeam: game.defenderId,
            teamMode,
            turn: game.turn || 1,
            victoryType: 'objective_defense',
            message: `${getTeamLabel(game.defenderId)} wins by holding Paris for ${game.turnLimit} turns!`
          }
        }
        
        // Attacker (Player 0) wins if they capture all objective hexes
        const p0ControlsAll = game.objectiveHexes.every(objHex => {
          const unitOnHex = aliveUnits.find(u => u.q === sanitizeCoordinate(objHex.q) && u.r === sanitizeCoordinate(objHex.r))
          if (!unitOnHex) return false
          const teamId = teamMode ? getTeamId(unitOnHex.ownerID) : unitOnHex.ownerID
          return teamId === game.attackerId
        })
        
        if (p0ControlsAll && game.objectiveControl[game.attackerId] >= 3) {
          victoryInfo = {
            winner: game.attackerId,
            winnerTeam: game.attackerId,
            teamMode,
            turn: game.turn || 1,
            victoryType: 'objective_capture',
            message: `${getTeamLabel(game.attackerId)} wins by capturing Paris!`
          }
        }
        
        // Elimination still works as alternate victory
        if (teamMode ? teamRedYellowAlive === 0 : p1Alive === 0) {
          victoryInfo = {
            winner: game.attackerId,
            winnerTeam: game.attackerId,
            teamMode,
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `${getTeamLabel(game.attackerId)} wins by eliminating all defenders!`
          }
        }
        if (teamMode ? teamBlueGreenAlive === 0 : p0Alive === 0) {
          victoryInfo = {
            winner: game.defenderId,
            winnerTeam: game.defenderId,
            teamMode,
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `${getTeamLabel(game.defenderId)} wins by eliminating all attackers!`
          }
        }
      } else {
        // Standard ELIMINATION mode
        if (!teamMode && p0Alive === 0 && p1Alive > 0) {
          victoryInfo = {
            winner: '1',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 1 wins by eliminating all enemy units in ${game.turn || 1} turns!`
          }
        } else if (!teamMode && p1Alive === 0 && p0Alive > 0) {
          victoryInfo = {
            winner: '0',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 0 wins by eliminating all enemy units in ${game.turn || 1} turns!`
          }
        } else if (!teamMode && p0Alive === 0 && p1Alive === 0) {
          victoryInfo = {
            draw: true,
            turn: game.turn || 1,
            victoryType: 'mutual_destruction',
            message: `Draw! Both players eliminated in ${game.turn || 1} turns!`
          }
        } else if (!teamMode && (game.turn || 1) >= 50) {
          if (p0Alive > p1Alive) {
            victoryInfo = {
              winner: '0',
              turn: game.turn,
              victoryType: 'turn_limit',
              message: `Player 0 wins by having more units after ${game.turn} turns!`
            }
          } else if (p1Alive > p0Alive) {
            victoryInfo = {
              winner: '1',
              turn: game.turn,
              victoryType: 'turn_limit',
              message: `Player 1 wins by having more units after ${game.turn} turns!`
            }
          } else {
            victoryInfo = {
              draw: true,
              turn: game.turn,
              victoryType: 'turn_limit_draw',
              message: `Draw! Equal units after ${game.turn} turns!`
            }
          }
        }

        if (teamMode) {
          if (teamBlueGreenAlive === 0 && teamRedYellowAlive > 0) {
            victoryInfo = {
              winner: 'red-yellow',
              winnerTeam: 'red-yellow',
              teamMode,
              turn: game.turn || 1,
              victoryType: 'elimination',
              message: `${getTeamLabel('red-yellow')} wins by eliminating all enemy units in ${game.turn || 1} turns!`
            }
          } else if (teamRedYellowAlive === 0 && teamBlueGreenAlive > 0) {
            victoryInfo = {
              winner: 'blue-green',
              winnerTeam: 'blue-green',
              teamMode,
              turn: game.turn || 1,
              victoryType: 'elimination',
              message: `${getTeamLabel('blue-green')} wins by eliminating all enemy units in ${game.turn || 1} turns!`
            }
          } else if (teamRedYellowAlive === 0 && teamBlueGreenAlive === 0) {
            victoryInfo = {
              draw: true,
              teamMode,
              turn: game.turn || 1,
              victoryType: 'mutual_destruction',
              message: `Draw! Both teams eliminated in ${game.turn || 1} turns!`
            }
          } else if ((game.turn || 1) >= 50) {
            if (teamBlueGreenAlive > teamRedYellowAlive) {
              victoryInfo = {
                winner: 'blue-green',
                winnerTeam: 'blue-green',
                teamMode,
                turn: game.turn,
                victoryType: 'turn_limit',
                message: `${getTeamLabel('blue-green')} wins by having more units after ${game.turn} turns!`
              }
            } else if (teamRedYellowAlive > teamBlueGreenAlive) {
              victoryInfo = {
                winner: 'red-yellow',
                winnerTeam: 'red-yellow',
                teamMode,
                turn: game.turn,
                victoryType: 'turn_limit',
                message: `${getTeamLabel('red-yellow')} wins by having more units after ${game.turn} turns!`
              }
            } else {
              victoryInfo = {
                draw: true,
                teamMode,
                turn: game.turn,
                victoryType: 'turn_limit_draw',
                message: `Draw! Equal units after ${game.turn} turns!`
              }
            }
          }
        }
      }
      
      if (victoryInfo) {
        game.gameOver = victoryInfo
        game.log.push(`🎮 GAME OVER: ${victoryInfo.message}`)
      }
    }
    
    // Save updated game state
    try {
      await setGame(gameId, game)
    } catch (saveError) {
      console.error('❌ KV setGame failed:', saveError)
      return NextResponse.json({ 
        error: 'Database error: Unable to save game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    console.log('📡 Broadcasting updated game state')
    return NextResponse.json({ 
      success: true, 
      gameState: game,
      message: `Action ${gameAction} completed successfully`
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
    
  } catch (error) {
    console.error('❌ Action route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}
