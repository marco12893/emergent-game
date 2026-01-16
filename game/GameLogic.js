import { INVALID_MOVE } from 'boardgame.io/core'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// UNIT DEFINITIONS - Medieval Roster
// ============================================
export const UNIT_TYPES = {
  SWORDSMAN: {
    type: 'SWORDSMAN',
    name: 'Swordsman',
    emoji: '⚔️',
    maxHP: 100,
    attackPower: 25,
    movePoints: 2,
    range: 1, // Melee only
    description: 'Balanced infantry unit with average stats.',
  },
  ARCHER: {
    type: 'ARCHER',
    name: 'Archer',
    emoji: '🏹',
    maxHP: 60,
    attackPower: 20,
    movePoints: 1,
    range: 2, // Ranged attack
    description: 'Slow but can attack from distance without counter-attack.',
  },
  KNIGHT: {
    type: 'KNIGHT',
    name: 'Knight',
    emoji: '🐴',
    maxHP: 150,
    attackPower: 35,
    movePoints: 3,
    range: 1, // Melee only
    description: 'Fast, powerful cavalry unit with high HP.',
  },
}

// ============================================
// TERRAIN DEFINITIONS
// ============================================
export const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true },
  FOREST: { name: 'Forest', defenseBonus: 2, moveCost: 1, passable: true },
  MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false },
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Create a new unit instance
export const createUnit = (unitType, ownerID, q, r) => {
  const template = UNIT_TYPES[unitType]
  return {
    id: uuidv4(),
    type: template.type,
    name: template.name,
    emoji: template.emoji,
    currentHP: template.maxHP,
    maxHP: template.maxHP,
    attackPower: template.attackPower,
    movePoints: template.movePoints,
    maxMovePoints: template.movePoints,
    range: template.range,
    ownerID: ownerID,
    q: q,
    r: r,
    s: -q - r,
    hasMoved: false,
    hasAttacked: false,
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
export const isInSpawnZone = (q, r, playerID) => {
  if (playerID === '0') {
    return q <= -5
  } else {
    return q >= 4
  }
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
      
      // Check terrain
      const terrain = terrainMap[key] || 'PLAIN'
      const terrainData = TERRAIN_TYPES[terrain]
      
      if (!terrainData.passable) continue
      
      const moveCost = terrainData.moveCost
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
  moves: {
    placeUnit: ({ G, ctx, playerID }, unitType, q, r) => {
      // Validate unit type
      if (!UNIT_TYPES[unitType]) {
        return INVALID_MOVE
      }
      
      // Check spawn zone
      if (!isInSpawnZone(q, r, playerID)) {
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
      
      // Check unit limit (5 units per player)
      const playerUnits = G.units.filter(u => u.ownerID === playerID)
      if (playerUnits.length >= 5) {
        return INVALID_MOVE
      }
      
      // Create and place the unit
      const newUnit = createUnit(unitType, playerID, q, r)
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
    
    readyForBattle: ({ G, ctx, playerID }) => {
      G.playersReady[playerID] = true
      G.log.push(`Player ${playerID} is ready for battle!`)
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
      
      // Move the unit
      const oldQ = unit.q
      const oldR = unit.r
      unit.q = targetQ
      unit.r = targetR
      unit.s = -targetQ - targetR
      unit.hasMoved = true
      
      G.log.push(`Player ${playerID}'s ${unit.name} moved from (${oldQ}, ${oldR}) to (${targetQ}, ${targetR})`)
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
      
      const damage = Math.max(1, attacker.attackPower - defenseBonus)
      target.currentHP -= damage
      attacker.hasAttacked = true
      
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
        }
      })
      
      G.selectedUnitId = null
      G.log.push(`Player ${playerID} ended their turn.`)
      
      events.endTurn()
    },
  },
  
  turn: {
    minMoves: 0,
    maxMoves: 100, // Allow multiple actions per turn
  },
}

// ============================================
// MAIN GAME DEFINITION
// ============================================
export const MedievalBattleGame = {
  name: 'medieval-battle',
  
  setup: ({ ctx }) => {
    // Generate hex map data
    const hexes = []
    const terrainMap = {}
    const MAP_WIDTH = 6
    const MAP_HEIGHT = 4
    
    // Generate hexes
    for (let r = -MAP_HEIGHT; r <= MAP_HEIGHT; r++) {
      const rOffset = Math.floor(r / 2)
      for (let q = -MAP_WIDTH - rOffset; q <= MAP_WIDTH - rOffset; q++) {
        const s = -q - r
        hexes.push({ q, r, s })
        
        // Assign terrain
        let terrain = 'PLAIN'
        
        // Mountains in center
        const mountainPositions = [
          { q: 0, r: -2 }, { q: 0, r: -1 }, { q: 1, r: -2 },
          { q: -1, r: 0 }, { q: 0, r: 0 },
        ]
        if (mountainPositions.some(pos => pos.q === q && pos.r === r)) {
          terrain = 'MOUNTAIN'
        }
        
        // Forests
        const forestPositions = [
          { q: -4, r: 0 }, { q: -4, r: 1 }, { q: -3, r: 0 }, { q: -5, r: 2 },
          { q: 3, r: -1 }, { q: 4, r: -2 }, { q: 4, r: -1 }, { q: 3, r: 0 },
          { q: -1, r: 3 }, { q: 0, r: 3 }, { q: 1, r: 2 },
          { q: -1, r: -3 }, { q: 0, r: -4 }, { q: 1, r: -4 },
        ]
        if (forestPositions.some(pos => pos.q === q && pos.r === r)) {
          terrain = 'FOREST'
        }
        
        terrainMap[`${q},${r}`] = terrain
      }
    }
    
    return {
      hexes,
      terrainMap,
      units: [],
      selectedUnitId: null,
      playersReady: { '0': false, '1': false },
      log: ['Game started! Place your units in your spawn zone.'],
    }
  },
  
  phases: {
    setup: setupPhase,
    battle: battlePhase,
  },
  
  turn: {
    minMoves: 0,
    maxMoves: 100,
  },
  
  endIf: ({ G, ctx }) => {
    // Only check victory in battle phase
    if (ctx.phase !== 'battle') return
    
    // Remove dead units
    const aliveUnits = G.units.filter(u => u.currentHP > 0)
    
    const p0Alive = aliveUnits.filter(u => u.ownerID === '0').length
    const p1Alive = aliveUnits.filter(u => u.ownerID === '1').length
    
    if (p0Alive === 0 && p1Alive > 0) {
      return { winner: '1' }
    }
    if (p1Alive === 0 && p0Alive > 0) {
      return { winner: '0' }
    }
    if (p0Alive === 0 && p1Alive === 0) {
      return { draw: true }
    }
  },
  
  minPlayers: 2,
  maxPlayers: 2,
}

export default MedievalBattleGame
