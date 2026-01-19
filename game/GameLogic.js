import { INVALID_MOVE } from 'boardgame.io/dist/cjs/core.js'
import { v4 as uuidv4 } from 'uuid'

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
  WATER: { name: 'Water', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: true },
  HILLS: { name: 'Hills', defenseBonus: 15, moveCost: 2, passable: true, waterOnly: false },
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
    image: template.image,
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
      
      // Naval units can only move on water, ground units cannot move on water
      const isNaval = unit.isNaval || false
      if (isNaval && !terrainData.waterOnly) continue
      if (!isNaval && terrainData.waterOnly) continue
      
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
            
            // Check terrain
            const terrain = terrainMap[key] || 'PLAIN'
            const terrainData = TERRAIN_TYPES[terrain]
            
            if (!terrainData.passable) continue
            
            // Check if occupied by any unit (except the moving unit)
            if (isHexOccupied(neighbor.q, neighbor.r, units.filter(u => u.id !== unit.id))) continue
            
            visited.add(key)
            queue.push({ ...neighbor, cost: current.cost + terrainData.moveCost })
          }
        }
        
        return Infinity // Should not happen if reachable
      }
      
      const actualCost = getMovementCost(unit.q, unit.r, targetQ, targetR, G.hexes, G.units, G.terrainMap)
      
      // Move the unit
      const oldQ = unit.q
      const oldR = unit.r
      unit.q = targetQ
      unit.r = targetR
      unit.s = -targetQ - targetR
      unit.movePoints -= actualCost
      unit.hasMoved = unit.movePoints <= 0 // Mark as moved if no movement points left
      
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
    
    // Generate hex map data based on game mode
    const hexes = []
    const terrainMap = {}
    const MAP_WIDTH = modeConfig.mapSize.width
    const MAP_HEIGHT = modeConfig.mapSize.height
    
    // Generate hexes
    for (let r = -MAP_HEIGHT; r <= MAP_HEIGHT; r++) {
      const rOffset = Math.floor(r / 2)
      for (let q = -MAP_WIDTH - rOffset; q <= MAP_WIDTH - rOffset; q++) {
        const s = -q - r
        hexes.push({ q, r, s })
        
        // Assign terrain based on game mode
        let terrain = 'PLAIN'
        
        if (gameMode === 'ATTACK_DEFEND') {
          // Attack & Defend map with Paris in center
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
          else if ((q === -3 && r === 0) || (q === 3 && r === -2) || (q === -1 && r === 3) || (q === 1, r === -4)) {
            terrain = 'FOREST'
          }
        } else {
          // ELIMINATION mode - original terrain
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
          
          // Water at edges
          if (Math.abs(q) >= MAP_WIDTH || Math.abs(r) >= MAP_HEIGHT) {
            terrain = 'WATER'
          }
        }
        
        terrainMap[`${q},${r}`] = terrain
      }
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
