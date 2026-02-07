import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_MAP_ID, generateMapData, getMapConfig } from './maps'

// ============================================
// UNIT DEFINITIONS - Medieval Roster
// ============================================
export const UNIT_TYPES = {
  SWORDSMAN: {
    type: 'SWORDSMAN',
    name: 'Swordsman',
    image: 'swordsman',
    maxHP: 100,
    attackPower: 25,
    movePoints: 2,
    range: 1, // Melee only
    description: 'Balanced infantry unit with average stats.',
  },
  ARCHER: {
    type: 'ARCHER',
    name: 'Archer',
    image: 'archer',
    maxHP: 60,
    attackPower: 20,
    movePoints: 2,
    range: 2, // Ranged attack
    description: 'Ranged unit that can attack from distance without counter-attack.',
  },
  KNIGHT: {
    type: 'KNIGHT',
    name: 'Knight',
    image: 'knight',
    maxHP: 150,
    attackPower: 35,
    movePoints: 3,
    range: 1, // Melee only
    description: 'Fast, powerful cavalry unit with high HP.',
  },
  MILITIA: {
    type: 'MILITIA',
    name: 'Militia',
    image: 'militia',
    maxHP: 40,
    attackPower: 20,
    movePoints: 2,
    range: 1, // Melee only
    description: 'Light infantry unit with low HP but decent speed.',
  },
  CATAPULT: {
    type: 'CATAPULT',
    name: 'Catapult',
    image: 'catapult',
    maxHP: 40,
    attackPower: 50,
    movePoints: 1,
    range: 3, // Long range siege weapon
    description: 'Siege weapon with high damage but cannot move and attack in same turn.',
  },
  WARSHIP: {
    type: 'WARSHIP',
    name: 'Warship',
    emoji: '⛵',
    maxHP: 120,
    attackPower: 30,
    movePoints: 3,
    range: 2,
    isNaval: true,
    description: 'Naval unit that can only move on water.',
  },
}

const TRANSPORT_STATS = {
  name: 'Transport',
  image: 'transport',
  maxHP: 40,
  attackPower: 10,
  movePoints: 2,
  range: 1,
}

// ============================================
// GAME MODE DEFINITIONS
// ============================================
export const GAME_MODES = {
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

// ============================================
// TERRAIN DEFINITIONS
// ============================================
export const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: false },
  FOREST: { name: 'Forest', defenseBonus: 10, moveCost: 1, passable: true, waterOnly: false },
  MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false },
  WATER: { name: 'Water', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: true },
  HILLS: { name: 'Hills', defenseBonus: 8, moveCost: 2, passable: true, waterOnly: false },
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getTerrainData = (terrainMap, q, r) => {
  const terrainKey = `${q},${r}`
  const terrain = terrainMap[terrainKey] || 'PLAIN'
  return TERRAIN_TYPES[terrain]
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

// Create a new unit instance
export const createUnit = (unitType, ownerID, q, r) => {
  const template = UNIT_TYPES[unitType]
  return {
    id: uuidv4(),
    type: template.type,
    baseType: template.type,
    name: template.name,
    image: template.image,
    currentHP: template.maxHP,
    maxHP: template.maxHP,
    attackPower: template.attackPower,
    movePoints: template.movePoints,
    maxMovePoints: template.movePoints,
    range: template.range,
    isNaval: template.isNaval || false,
    isTransport: false,
    ownerID: ownerID,
    q: q,
    r: r,
    s: -q - r,
    hasMoved: false,
    hasAttacked: false,
    lastMove: null,
  }
}

// Calculate hex distance (cube coordinates)
export const hexDistance = (hex1, hex2) => {
  return Math.max(
    Math.abs(hex1.q - hex2.q),
    Math.abs(hex1.r - hex2.r),
    Math.abs(hex1.s - hex2.s)
  )
}

// Get all hexes within range
export const getHexesInRange = (centerHex, range, allHexes) => {
  return allHexes.filter(hex => {
    const dist = hexDistance(centerHex, hex)
    return dist > 0 && dist <= range
  })
}

// Get neighboring hexes (distance 1)
export const getNeighbors = (hex, allHexes) => {
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
export const isHexOccupied = (q, r, units) => {
  return units.some(u => u.q === q && u.r === r && u.currentHP > 0)
}

// Get unit at hex
export const getUnitAtHex = (q, r, units) => {
  return units.find(u => u.q === q && u.r === r && u.currentHP > 0)
}

// Check if hex is in spawn zone
export const isInSpawnZone = (q, r, playerID, mapWidth) => {
  const leftSpawnMax = -mapWidth + 1
  const rightSpawnMin = mapWidth - 2
  if (playerID === '0') {
    return q <= leftSpawnMax
  }
  return q >= rightSpawnMin
}

// Calculate reachable hexes for a unit (BFS with move points)
export const getReachableHexes = (unit, allHexes, units, terrainMap) => {
  const reachable = []
  const visited = new Set()
  const queue = [{ q: unit.q, r: unit.r, s: unit.s, remainingMove: unit.movePoints }]
  
  visited.add(`${unit.q},${unit.r}`)
  
  while (queue.length > 0) {
    const current = queue.shift()
    
    const neighbors = getNeighbors(current, allHexes)
    
    for (const neighbor of neighbors) {
      const key = `${neighbor.q},${neighbor.r}`
      if (visited.has(key)) continue
      
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
      
      const moveCost = embarking || disembarking ? unit.maxMovePoints : terrainData.moveCost
      const remainingAfterMove = current.remainingMove - moveCost
      
      if (remainingAfterMove < 0) continue
      
      // Check if occupied by any unit
      if (isHexOccupied(neighbor.q, neighbor.r, units)) continue
      
      visited.add(key)
      reachable.push({ q: neighbor.q, r: neighbor.r, s: neighbor.s })
      
      if (remainingAfterMove > 0) {
        queue.push({ ...neighbor, remainingMove: remainingAfterMove })
      }
    }
  }
  
  return reachable
}

// Get attackable hexes for a unit
export const getAttackableHexes = (unit, allHexes, units) => {
  const hexesInRange = getHexesInRange(unit, unit.range, allHexes)
  
  return hexesInRange.filter(hex => {
    const targetUnit = getUnitAtHex(hex.q, hex.r, units)
    return targetUnit && targetUnit.ownerID !== unit.ownerID
  })
}

// ============================================
// GAME PHASES
// ============================================

// Setup phase: Players place units in spawn zones
const setupPhase = {
  start: true,
  turn: {
    minMoves: 0,
    maxMoves: 100,
  },
  moves: {
    placeUnit: ({ G, ctx, playerID }, unitType, q, r) => {
      // Validate unit type
      if (!UNIT_TYPES[unitType]) {
        return INVALID_MOVE
      }
      
      // Check spawn zone
      if (!isInSpawnZone(q, r, playerID, G.mapSize?.width || GAME_MODES[G.gameMode]?.mapSize?.width || 6)) {
        return INVALID_MOVE
      }
      
      // Check if hex exists
      const hexExists = G.hexes.some(h => h.q === q && h.r === r)
      if (!hexExists) {
        return INVALID_MOVE
      }
      
      // Check if hex is occupied
      if (isHexOccupied(q, r, G.units)) {
        return INVALID_MOVE
      }

      const terrainData = getTerrainData(G.terrainMap, q, r)
      const template = UNIT_TYPES[unitType]
      if (template?.isNaval && !terrainData.waterOnly) {
        return INVALID_MOVE
      }
      
      // Check unit limit (5 units per player)
      const playerUnits = G.units.filter(u => u.ownerID === playerID)
      if (playerUnits.length >= 5) {
        return INVALID_MOVE
      }
      
      // Create and place the unit
      const newUnit = createUnit(unitType, playerID, q, r)
      if (terrainData.waterOnly && !newUnit.isNaval) {
        applyTransportState(newUnit, { resetMovePoints: true })
      }
      G.units.push(newUnit)
      
      // Log the action
      G.log.push(`Player ${playerID} placed ${UNIT_TYPES[unitType].name} at (${q}, ${r})`)
    },
    
    removeUnit: ({ G, ctx, playerID }, unitId) => {
      const unitIndex = G.units.findIndex(u => u.id === unitId && u.ownerID === playerID)
      if (unitIndex === -1) {
        return INVALID_MOVE
      }
      
      const unit = G.units[unitIndex]
      G.log.push(`Player ${playerID} removed ${unit.name} from (${unit.q}, ${unit.r})`)
      G.units.splice(unitIndex, 1)
    },
    
    readyForBattle: ({ G, ctx, playerID, events }) => {
      G.playersReady[playerID] = true
      G.log.push(`Player ${playerID} is ready for battle!`)
      
      // Auto end turn after ready for battle in setup phase
      if (ctx.phase === 'setup') {
        events.endTurn()
      }
    },
    
    endTurn: ({ G, ctx, events, playerID }) => {
      G.log.push(`Player ${playerID} ended their setup turn.`)
      events.endTurn()
    },
  },
  
  endIf: ({ G }) => {
    // End setup when both players are ready and have at least 1 unit
    const p0Units = G.units.filter(u => u.ownerID === '0').length
    const p1Units = G.units.filter(u => u.ownerID === '1').length
    
    return G.playersReady['0'] && G.playersReady['1'] && p0Units > 0 && p1Units > 0
  },
  
  next: 'battle',
}

// Battle phase: Turn-based combat
const battlePhase = {
  moves: {
    selectUnit: ({ G, ctx, playerID }, unitId) => {
      const unit = G.units.find(u => u.id === unitId)
      if (!unit || unit.ownerID !== playerID) {
        return INVALID_MOVE
      }
      G.selectedUnitId = unitId
    },
    
    deselectUnit: ({ G }) => {
      G.selectedUnitId = null
    },
    
    moveUnit: ({ G, ctx, playerID }, unitId, targetQ, targetR) => {
      const unit = G.units.find(u => u.id === unitId)
      
      if (!unit || unit.ownerID !== playerID) {
        return INVALID_MOVE
      }
      
      if (unit.hasMoved) {
        return INVALID_MOVE
      }
      
      // Calculate reachable hexes
      const reachable = getReachableHexes(unit, G.hexes, G.units, G.terrainMap)
      const isReachable = reachable.some(h => h.q === targetQ && h.r === targetR)
      
      if (!isReachable) {
        return INVALID_MOVE
      }

      const targetTerrain = getTerrainData(G.terrainMap, targetQ, targetR)
      const isEmbarkMove = targetTerrain.waterOnly && !unit.isNaval && !unit.isTransport
      const isDisembarkMove = !targetTerrain.waterOnly && unit.isTransport

      if (isEmbarkMove && !canEmbark(unit)) {
        return INVALID_MOVE
      }
      if (isDisembarkMove && !canDisembark(unit)) {
        return INVALID_MOVE
      }
      
      // Calculate actual movement cost for the path taken
      const getMovementCost = (startQ, startR, targetQ, targetR, allHexes, units, terrainMap) => {
        // Simple BFS to find the actual path cost
        const visited = new Set()
        const queue = [{ q: startQ, r: startR, s: -startQ - startR, cost: 0 }]
        visited.add(`${startQ},${startR}`)
        
        while (queue.length > 0) {
          const current = queue.shift()
          
          if (current.q === targetQ && current.r === targetR) {
            return current.cost
          }
          
          const neighbors = getNeighbors(current, allHexes)
          
          for (const neighbor of neighbors) {
            const key = `${neighbor.q},${neighbor.r}`
            if (visited.has(key)) continue
            
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
            
            // Check if occupied by any unit (except the moving unit)
            if (isHexOccupied(neighbor.q, neighbor.r, units.filter(u => u.id !== unit.id))) continue
            
            visited.add(key)
            const moveCost = embarking || disembarking ? unit.maxMovePoints : terrainData.moveCost
            queue.push({ ...neighbor, cost: current.cost + moveCost })
          }
        }
        
        return Infinity // Should not happen if reachable
      }
      
      const actualCost = getMovementCost(unit.q, unit.r, targetQ, targetR, G.hexes, G.units, G.terrainMap)
      
      unit.lastMove = {
        q: unit.q,
        r: unit.r,
        s: unit.s,
        movePoints: unit.movePoints,
        hasMoved: unit.hasMoved,
      }

      // Move the unit
      const oldQ = unit.q
      const oldR = unit.r
      unit.q = targetQ
      unit.r = targetR
      unit.s = -targetQ - targetR
      unit.movePoints -= actualCost

      if (isEmbarkMove) {
        applyTransportState(unit)
        unit.movePoints = 0
        unit.hasMoved = true
        unit.hasAttacked = true
      } else if (isDisembarkMove) {
        restoreFromTransport(unit)
        unit.movePoints = 0
        unit.hasMoved = true
        unit.hasAttacked = true
      } else {
        unit.hasMoved = unit.movePoints <= 0 // Mark as moved if no movement points left
      }
      
      G.log.push(`Player ${playerID}'s ${unit.name} moved from (${oldQ}, ${oldR}) to (${targetQ}, ${targetR})`)
    },

    undoMove: ({ G, ctx, playerID }, unitId) => {
      const unit = G.units.find(u => u.id === unitId)
      if (!unit || unit.ownerID !== playerID) {
        return INVALID_MOVE
      }
      if (unit.hasAttacked || !unit.lastMove) {
        return INVALID_MOVE
      }

      const previous = unit.lastMove
      unit.q = previous.q
      unit.r = previous.r
      unit.s = previous.s
      unit.movePoints = previous.movePoints
      unit.hasMoved = previous.hasMoved
      unit.lastMove = null

      G.log.push(`Player ${playerID}'s ${unit.name} undid their move.`)
    },
    
    attackUnit: ({ G, ctx, playerID }, attackerId, targetId) => {
      const attacker = G.units.find(u => u.id === attackerId)
      const target = G.units.find(u => u.id === targetId)
      
      if (!attacker || !target) {
        return INVALID_MOVE
      }
      
      if (attacker.ownerID !== playerID || target.ownerID === playerID) {
        return INVALID_MOVE
      }
      
      if (attacker.hasAttacked) {
        return INVALID_MOVE
      }
      
      // Check range
      const distance = hexDistance(attacker, target)
      if (distance > attacker.range) {
        return INVALID_MOVE
      }
      
      // Calculate damage (with terrain defense bonus)
      const targetHexKey = `${target.q},${target.r}`
      const terrain = G.terrainMap[targetHexKey] || 'PLAIN'
      const defenseBonus = TERRAIN_TYPES[terrain].defenseBonus
      const attackerTerrain = G.terrainMap[`${attacker.q},${attacker.r}`] || 'PLAIN'
      const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(attacker.type)
        ? 5
        : 0

      const damage = Math.max(1, attacker.attackPower + hillBonus - defenseBonus)
      target.currentHP -= damage
      attacker.hasAttacked = true
      attacker.lastMove = null
      
      G.log.push(`Player ${playerID}'s ${attacker.name} hit ${target.name} for ${damage} damage!`)
      
      // Check if target is killed
      if (target.currentHP <= 0) {
        G.log.push(`${target.name} was defeated!`)
      }
      
      // Counter-attack for melee (if target is still alive and attacker is in melee range)
      if (target.currentHP > 0 && attacker.range === 1 && distance === 1) {
        const counterDamage = Math.max(1, Math.floor(target.attackPower * 0.5))
        attacker.currentHP -= counterDamage
        G.log.push(`${target.name} counter-attacked for ${counterDamage} damage!`)
        
        if (attacker.currentHP <= 0) {
          G.log.push(`${attacker.name} was defeated!`)
        }
      }
    },
    
    endTurn: ({ G, ctx, events, playerID }) => {
      // Reset unit action flags for current player
      G.units.forEach(unit => {
        if (unit.ownerID === playerID) {
          unit.hasMoved = false
          unit.hasAttacked = false
          unit.movePoints = unit.maxMovePoints
          unit.lastMove = null
        }
      })
      
      G.selectedUnitId = null
      G.log.push(`Player ${playerID} ended their turn.`)
      
      events.endTurn()
    },
    
    toggleRetreatMode: ({ G, ctx }) => {
      // Only allow retreat after turn 10
      if (G.turn >= 10) {
        G.retreatModeActive = !G.retreatModeActive
        G.log.push(G.retreatModeActive ? '🚨 Retreat mode ACTIVATED!' : 'Retreat mode deactivated.')
      }
    },
    
    retreatUnit: ({ G, ctx, playerID }, unitId, targetQ, targetR) => {
      const unit = G.units.find(u => u.id === unitId)
      
      if (!unit || unit.ownerID !== playerID) {
        return INVALID_MOVE
      }
      
      if (!G.retreatModeActive) {
        return INVALID_MOVE
      }
      
      // Check if target is an extraction hex
      const isExtraction = G.extractionHexes.some(h => h.q === targetQ && h.r === targetR)
      if (!isExtraction) {
        return INVALID_MOVE
      }
      
      // Check if unit can reach it
      const reachable = getReachableHexes(unit, G.hexes, G.units, G.terrainMap)
      const canReach = reachable.some(h => h.q === targetQ && h.r === targetR)
      
      if (!canReach) {
        return INVALID_MOVE
      }
      
      // Remove unit (retreat successful)
      const unitIndex = G.units.findIndex(u => u.id === unitId)
      G.units.splice(unitIndex, 1)
      
      G.log.push(`Player ${playerID}'s ${unit.name} successfully retreated!`)
    },
  },
  
  turn: {
    minMoves: 0,
    maxMoves: 100, // Allow multiple actions per turn
    onBegin: ({ G, ctx }) => {
      // Ensure player 0 always starts the battle phase
      if (ctx.turn === 0) {
        G.log.push('⚔️ BATTLE PHASE BEGINS! Player 0 gets the first turn.')
      }
    },
  },
}

// ============================================
// MAIN GAME DEFINITION
// ============================================
export const MedievalBattleGame = {
  name: 'medieval-battle',
  
  setup: ({ ctx, setupData }) => {
    // Get game mode from setup data or default to ELIMINATION
    const gameMode = setupData?.gameMode || 'ELIMINATION'
    const modeConfig = GAME_MODES[gameMode]
    
    const mapId = setupData?.mapId || DEFAULT_MAP_ID
    let hexes = []
    let terrainMap = {}
    let MAP_WIDTH = modeConfig.mapSize.width
    let MAP_HEIGHT = modeConfig.mapSize.height

    if (gameMode === 'ATTACK_DEFEND') {
      // Generate hexes for Attack & Defend mode
      for (let r = -MAP_HEIGHT; r <= MAP_HEIGHT; r++) {
        const rOffset = Math.floor(r / 2)
        for (let q = -MAP_WIDTH - rOffset; q <= MAP_WIDTH - rOffset; q++) {
          const s = -q - r
          hexes.push({ q, r, s })

          let terrain = 'PLAIN'

          // Water around the edges
          if (Math.abs(q) >= MAP_WIDTH - 1 || Math.abs(r) >= MAP_HEIGHT - 1) {
            terrain = 'WATER'
          }
          // Paris objective area (forests and hills for defense)
          else if (modeConfig.objectiveHexes.some(pos => pos.q === q && pos.r === r)) {
            terrain = 'HILLS'
          }
          // Mountains as obstacles
          else if ((q === 2 && r === -1) || (q === -2 && r === 1) || (q === 0 && r === -3)) {
            terrain = 'MOUNTAIN'
          }
          // Forests
          else if ((q === -3 && r === 0) || (q === 3 && r === -2) || (q === -1 && r === 3) || (q === 1 && r === -4)) {
            terrain = 'FOREST'
          }

          terrainMap[`${q},${r}`] = terrain
        }
      }
    } else {
      const mapData = generateMapData(mapId)
      hexes = mapData.hexes
      terrainMap = mapData.terrainMap
      MAP_WIDTH = mapData.mapConfig.size.width
      MAP_HEIGHT = mapData.mapConfig.size.height
    }
    
    // Define extraction hexes (edges of map for retreat)
    const extractionHexes = []
    hexes.forEach(hex => {
      if (Math.abs(hex.q) >= MAP_WIDTH - 1 || Math.abs(hex.r) >= MAP_HEIGHT - 1) {
        if (terrainMap[`${hex.q},${hex.r}`] !== 'WATER' && terrainMap[`${hex.q},${hex.r}`] !== 'MOUNTAIN') {
          extractionHexes.push({ q: hex.q, r: hex.r })
        }
      }
    })
    
    return {
      hexes,
      terrainMap,
      units: [],
      selectedUnitId: null,
      playersReady: { '0': false, '1': false },
      turn: 1,
      phase: 'setup',
      log: ['Game started! Place your units in your spawn zone.'],
      gameMode: gameMode,
      mapId,
      mapSize: { width: MAP_WIDTH, height: MAP_HEIGHT },
      retreatModeActive: false,
      extractionHexes: extractionHexes,
      objectiveHexes: modeConfig.objectiveHexes || [],
      turnLimit: modeConfig.turnLimit || null,
      objectiveControl: { '0': 0, '1': 0 }, // Track turns controlling objective
    }
  },
  
  phases: {
    setup: setupPhase,
    battle: {
      ...battlePhase,
      onPhaseBegin: ({ G, ctx }) => {
        // Reset currentPlayer to 0 when entering battle phase
        G.log.push('⚔️ BATTLE PHASE BEGINS! Player 0 gets the first turn.')
      },
    },
  },
  
  turn: {
    minMoves: 0,
    maxMoves: 100, // Allow multiple actions per turn
    onBegin: ({ G, ctx }) => {
      // Increment turn at the start of each round (when player 0's turn begins)
      if (ctx.currentPlayer === '0' && ctx.phase === 'battle') {
        if (G.turn === undefined) {
          G.turn = 1
        } else {
          G.turn += 1
        }
        G.log.push(`=== Turn ${G.turn} ===`)
        
        // Check objective control for Attack & Defend mode
        if (G.gameMode === 'ATTACK_DEFEND') {
          const aliveUnits = G.units.filter(u => u.currentHP > 0)
          
          // Check who controls the objective hexes
          let p0Controls = 0
          let p1Controls = 0
          
          G.objectiveHexes.forEach(objHex => {
            const unitOnHex = aliveUnits.find(u => u.q === objHex.q && u.r === objHex.r)
            if (unitOnHex) {
              if (unitOnHex.ownerID === '0') p0Controls++
              if (unitOnHex.ownerID === '1') p1Controls++
            }
          })
          
          // If one player controls all objective hexes, increment their control counter
          if (p0Controls === G.objectiveHexes.length) {
            G.objectiveControl['0']++
            G.log.push(`Player 0 holds Paris! (${G.objectiveControl['0']} turns)`)
          } else if (p1Controls === G.objectiveHexes.length) {
            G.objectiveControl['1']++
            G.log.push(`Player 1 holds Paris! (${G.objectiveControl['1']} turns)`)
          } else {
            G.log.push('Paris is contested!')
          }
        }
      }
    },
  },
  
  endIf: ({ G, ctx }) => {
    // Only check victory in battle phase
    if (ctx.phase !== 'battle') return
    
    // Remove dead units
    const aliveUnits = G.units.filter(u => u.currentHP > 0)
    
    const p0Alive = aliveUnits.filter(u => u.ownerID === '0').length
    const p1Alive = aliveUnits.filter(u => u.ownerID === '1').length
    
    // Attack & Defend mode victory conditions
    if (G.gameMode === 'ATTACK_DEFEND') {
      // Defender (Player 1) wins if they hold objective for required turns
      if (G.objectiveControl['1'] >= G.turnLimit) {
        return {
          winner: '1',
          turn: G.turn,
          victoryType: 'objective_defense',
          message: `Player 1 (Defender) wins by holding Paris for ${G.turnLimit} turns!`
        }
      }
      
      // Attacker (Player 0) wins if they capture all objective hexes
      const p0ControlsAll = G.objectiveHexes.every(objHex => {
        const unitOnHex = aliveUnits.find(u => u.q === objHex.q && u.r === objHex.r)
        return unitOnHex && unitOnHex.ownerID === '0'
      })
      
      if (p0ControlsAll && G.objectiveControl['0'] >= 3) {
        return {
          winner: '0',
          turn: G.turn,
          victoryType: 'objective_capture',
          message: `Player 0 (Attacker) wins by capturing Paris!`
        }
      }
      
      // Elimination still works as alternate victory
      if (p1Alive === 0) {
        return {
          winner: '0',
          turn: G.turn,
          victoryType: 'elimination',
          message: `Player 0 wins by eliminating all defenders!`
        }
      }
      if (p0Alive === 0) {
        return {
          winner: '1',
          turn: G.turn,
          victoryType: 'elimination',
          message: `Player 1 wins by eliminating all attackers!`
        }
      }
    } else {
      // Standard ELIMINATION mode
      if (p0Alive === 0 && p1Alive > 0) {
        return { 
          winner: '1', 
          turn: G.turn,
          victoryType: 'elimination',
          message: `Player 1 wins by eliminating all enemy units in ${G.turn} turns!`
        }
      }
      if (p1Alive === 0 && p0Alive > 0) {
        return { 
          winner: '0', 
          turn: G.turn,
          victoryType: 'elimination',
          message: `Player 0 wins by eliminating all enemy units in ${G.turn} turns!`
        }
      }
      if (p0Alive === 0 && p1Alive === 0) {
        return { 
          draw: true, 
          turn: G.turn,
          victoryType: 'mutual_destruction',
          message: `Draw! Both players eliminated in ${G.turn} turns!`
        }
      }
      
      // Optional: Turn limit victory (e.g., after 50 turns, player with more units wins)
      if (G.turn >= 50) {
        if (p0Alive > p1Alive) {
          return { 
            winner: '0', 
            turn: G.turn,
            victoryType: 'turn_limit',
            message: `Player 0 wins by having more units after ${G.turn} turns!`
          }
        } else if (p1Alive > p0Alive) {
          return { 
            winner: '1', 
            turn: G.turn,
            victoryType: 'turn_limit',
            message: `Player 1 wins by having more units after ${G.turn} turns!`
          }
        } else {
          return { 
            draw: true, 
            turn: G.turn,
            victoryType: 'turn_limit_draw',
            message: `Draw! Equal units after ${G.turn} turns!`
          }
        }
      }
    }
  },
  
  minPlayers: 2,
  maxPlayers: 2,
}

export default MedievalBattleGame
