import { NextResponse } from 'next/server'
import { getGame, setGame } from '@/lib/gameState'

// ============================================
// UNIT & TERRAIN DEFINITIONS
// ============================================

const UNIT_TYPES = {
  SWORDSMAN: {
    type: 'SWORDSMAN',
    name: 'Swordsman',
    emoji: '⚔️',
    maxHP: 100,
    attackPower: 25,
    movePoints: 2,
    range: 1,
    description: 'Balanced infantry unit.',
  },
  ARCHER: {
    type: 'ARCHER',
    name: 'Archer',
    emoji: '🏹',
    maxHP: 60,
    attackPower: 30,
    movePoints: 2,
    range: 2,
    description: 'Ranged unit with extended range.',
  },
  KNIGHT: {
    type: 'KNIGHT',
    name: 'Knight',
    emoji: '🐴',
    maxHP: 150,
    attackPower: 30,
    movePoints: 3,
    range: 1,
    description: 'Heavy cavalry with high HP and movement.',
  },
  MILITIA: {
    type: 'MILITIA',
    name: 'Militia',
    emoji: '🗡️',
    maxHP: 40,
    attackPower: 20,
    movePoints: 2,
    range: 1,
    description: 'Light infantry unit.',
  },
  CATAPULT: {
    type: 'CATAPULT',
    name: 'Catapult',
    emoji: '🏰',
    maxHP: 40,
    attackPower: 50,
    movePoints: 1,
    range: 3,
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
  MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false },
  WATER: { name: 'Water', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: true },
  HILLS: { name: 'Hills', defenseBonus: 15, moveCost: 2, passable: true, waterOnly: false },
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate hex distance (cube coordinates)
const hexDistance = (hex1, hex2) => {
  return Math.max(
    Math.abs(hex1.q - hex2.q),
    Math.abs(hex1.r - hex2.r),
    Math.abs(hex1.s - hex2.s)
  )
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
  return units.some(u => u.q === q && u.r === r && u.currentHP > 0)
}

// Calculate reachable hexes for a unit (BFS with move points)
const getReachableHexes = (unit, allHexes, units, terrainMap) => {
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
    const { gameId, action: gameAction, payload } = body
    
    console.log(`🎮 Action: ${gameAction} for game ${gameId}`)
    
    // Validate input
    if (!gameId || !gameAction) {
      return NextResponse.json({ 
        error: 'Missing required fields: gameId and action' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    let game
    try {
      game = await getGame(gameId)
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
      console.log('❌ Game not found:', gameId)
      return NextResponse.json({ 
        error: 'Game not found',
        gameId: gameId
      }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Handle different game actions
    try {
      switch (gameAction) {
        case 'placeUnit':
          // Validate payload
          if (!payload?.unitType || payload?.q === undefined || payload?.r === undefined || payload?.playerID === undefined) {
            return NextResponse.json({ 
              error: 'Missing required fields for placeUnit: unitType, q, r, playerID' 
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
          const stats = UNIT_TYPES[payload.unitType]
          if (!stats) {
            return NextResponse.json({ 
              error: 'Invalid unit type: ' + payload.unitType 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Check if unit is naval and terrain is water
          const terrainKey = `${payload.q},${payload.r}`
          const terrain = game.terrainMap[terrainKey] || 'PLAIN'
          const terrainData = TERRAIN_TYPES[terrain]
          
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
          
          if (!stats.isNaval && terrainData.waterOnly) {
            return NextResponse.json({ 
              error: 'Ground units cannot be placed on water tiles' 
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
          const inSpawnZone = payload.playerID === '0' ? 
            payload.q <= -5 : 
            payload.q >= 4
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
          const isOccupied = game.units.some(u => u.q === payload.q && u.r === payload.r && u.currentHP > 0)
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
            type: payload.unitType,
            name: stats.name,
            emoji: stats.emoji,
            ownerID: payload.playerID,
            q: payload.q,
            r: payload.r,
            s: -payload.q - payload.r,
            currentHP: stats.maxHP,
            maxHP: stats.maxHP,
            attackPower: stats.attackPower,
            movePoints: stats.movePoints,
            maxMovePoints: stats.movePoints,
            range: stats.range,
            isNaval: stats.isNaval || false,
            hasMoved: false,
            hasAttacked: false,
            hasMovedOrAttacked: false // For catapult move-or-attack restriction
          }
          
          game.units.push(newUnit)
          game.log.push(`Player ${payload.playerID} placed ${newUnit.name} at (${payload.q}, ${payload.r})`)
          game.lastUpdate = Date.now()
          break
          
        case 'removeUnit':
          if (!payload?.unitId) {
            return NextResponse.json({ 
              error: 'Missing required field for removeUnit: unitId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.units = game.units.filter(u => u.id !== payload.unitId)
          game.log.push(`Player ${payload.playerID} removed a unit`)
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
          
          game.selectedUnitId = payload.unitId
          break
          
        case 'deselectUnit':
          game.selectedUnitId = null
          break
          
        case 'moveUnit':
          if (!payload?.unitId || payload?.targetQ === undefined || payload?.targetR === undefined) {
            return NextResponse.json({ 
              error: 'Missing required fields for moveUnit: unitId, targetQ, targetR' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const movingUnit = game.units.find(u => u.id === payload.unitId)
          if (movingUnit && movingUnit.movePoints > 0) {
            // Catapult move-or-attack restriction
            if (movingUnit.type === 'CATAPULT' && movingUnit.hasMovedOrAttacked) {
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
            const reachable = getReachableHexes(movingUnit, game.hexes, game.units, game.terrainMap)
            const isReachable = reachable.some(h => h.q === payload.targetQ && h.r === payload.targetR)
            
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
                  
                  // Naval units can only move on water, ground units cannot move on water
                  const isNaval = movingUnit.isNaval || false
                  if (isNaval && !terrainData.waterOnly) continue
                  if (!isNaval && terrainData.waterOnly) continue
                  
                  if (!terrainData.passable) continue
                  
                  // Check if occupied by any unit (except the moving unit)
                  if (isHexOccupied(neighbor.q, neighbor.r, units.filter(u => u.id !== movingUnit.id))) continue
                  
                  visited.add(key)
                  queue.push({ ...neighbor, cost: current.cost + terrainData.moveCost })
                }
              }
              
              return Infinity // Should not happen if reachable
            }
            
            const actualCost = getMovementCost(movingUnit.q, movingUnit.r, payload.targetQ, payload.targetR, game.hexes, game.units, game.terrainMap)
            
            // Move the unit
            movingUnit.q = payload.targetQ
            movingUnit.r = payload.targetR
            movingUnit.s = -payload.targetQ - payload.targetR
            movingUnit.movePoints -= actualCost
            movingUnit.hasMoved = movingUnit.movePoints <= 0 // Mark as moved if no movement points left
            
            // Catapult move-or-attack restriction
            if (movingUnit.type === 'CATAPULT') {
              movingUnit.hasMovedOrAttacked = true
            }
            
            game.log.push(`Player ${payload.playerID}'s ${movingUnit.name} moved to (${payload.targetQ}, ${payload.targetR})`)
            game.lastUpdate = Date.now()
          } else {
            return NextResponse.json({ 
              error: 'Unit cannot move (not found, already moved, or no movement points)' 
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
          
          const attacker = game.units.find(u => u.id === payload.attackerId)
          const target = game.units.find(u => u.id === payload.targetId)
          
          if (attacker && target && !attacker.hasAttacked) {
            // Catapult move-or-attack restriction
            if (attacker.type === 'CATAPULT' && attacker.hasMovedOrAttacked) {
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
            const targetTerrainKey = `${target.q},${target.r}`
            const targetTerrain = game.terrainMap[targetTerrainKey] || 'PLAIN'
            const terrainData = TERRAIN_TYPES[targetTerrain]
            const defenseBonus = terrainData.defenseBonus || 0
            
            const baseDamage = attacker.attackPower
            
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
            
            const reducedDamage = Math.round(baseDamage * damageMultiplier)
            const actualDamage = Math.max(1, reducedDamage - defenseBonus) // Minimum 1 damage
            
            target.currentHP -= actualDamage
            attacker.hasAttacked = true
            
            // Catapult move-or-attack restriction
            if (attacker.type === 'CATAPULT') {
              attacker.hasMovedOrAttacked = true
            }
            
            game.log.push(`Player ${payload.playerID}'s ${attacker.name} hit ${target.name} for ${actualDamage} damage${damageMultiplier < 1.0 ? ` (reduced to ${Math.round(damageMultiplier * 100)}% due to wounds)` : ''}${defenseBonus > 0 ? ` (terrain defense +${defenseBonus})` : ''}!`)
            
            // Counter-attack logic (if target survives and is in range)
            if (target.currentHP > 0) {
              const distance = Math.max(
                Math.abs(attacker.q - target.q),
                Math.abs(attacker.r - target.r),
                Math.abs(attacker.s - target.s)
              )
              
              if (distance <= target.range) {
                // Calculate attacker's terrain defense bonus for counter-attack
                const attackerTerrainKey = `${attacker.q},${attacker.r}`
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
                if (target.type === 'CATAPULT') {
                  game.log.push(`${target.name} cannot counter-attack (siege weapon)!`)
                } else {
                  // Archer melee penalty: 50% less damage in melee combat
                  let meleePenaltyMultiplier = 1.0
                  if (target.type === 'ARCHER' && distance === 1) {
                    meleePenaltyMultiplier = 0.5 // 50% damage reduction in melee
                  }
                  
                  const targetReducedDamage = Math.round(targetBaseDamage * targetDamageMultiplier * meleePenaltyMultiplier)
                  const counterDamage = Math.max(1, targetReducedDamage - attackerDefenseBonus)
                  attacker.currentHP -= counterDamage
                  
                  game.log.push(`${target.name} counter-attacked for ${counterDamage} damage${targetDamageMultiplier < 1.0 ? ` (reduced to ${Math.round(targetDamageMultiplier * 100)}% due to wounds)` : ''}${meleePenaltyMultiplier < 1.0 ? ` (melee penalty -50%)` : ''}${attackerDefenseBonus > 0 ? ` (terrain defense +${attackerDefenseBonus})` : ''}!`)
                  
                  if (attacker.currentHP <= 0) {
                    game.units = game.units.filter(u => u.id !== attacker.id)
                    game.log.push(`${attacker.name} was defeated by counter-attack!`)
                  }
                }
              }
            }
            
            if (target.currentHP <= 0) {
              game.units = game.units.filter(u => u.id !== target.id)
              game.log.push(`${target.name} was defeated!`)
            }
            
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
          
          // Increment turn when switching from player 1 to player 0 (new round)
          if (game.currentPlayer === '1' && payload.playerID === '1') {
            if (game.turn === undefined) {
              game.turn = 1
            } else {
              game.turn += 1
            }
            game.log.push(`=== Turn ${game.turn} ===`)
            
            // Check objective control for Attack & Defend mode
            if (game.gameMode === 'ATTACK_DEFEND') {
              const aliveUnits = game.units.filter(u => u.currentHP > 0)
              
              // Check who controls the objective hexes
              let p0Controls = 0
              let p1Controls = 0
              
              game.objectiveHexes.forEach(objHex => {
                const unitOnHex = aliveUnits.find(u => u.q === objHex.q && u.r === objHex.r)
                if (unitOnHex) {
                  if (unitOnHex.ownerID === '0') p0Controls++
                  if (unitOnHex.ownerID === '1') p1Controls++
                }
              })
              
              // If one player controls all objective hexes, increment their control counter
              if (p0Controls === game.objectiveHexes.length) {
                game.objectiveControl['0']++
                game.log.push(`Player 0 holds Paris! (${game.objectiveControl['0']} turns)`)
              } else if (p1Controls === game.objectiveHexes.length) {
                game.objectiveControl['1']++
                game.log.push(`Player 1 holds Paris! (${game.objectiveControl['1']} turns)`)
              } else {
                game.log.push('Paris is contested!')
              }
            }
          }
          
          game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
          game.units.forEach(unit => {
            unit.hasMoved = false
            unit.hasAttacked = false
            unit.movePoints = unit.maxMovePoints // Reset movement points
            unit.hasMovedOrAttacked = false // Reset catapult move-or-attack restriction
          })
          game.log.push(`Player ${payload.playerID} ended turn. Player ${game.currentPlayer}'s turn begins.`)
          game.lastUpdate = Date.now()
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
          
          game.playersReady[payload.playerID] = true
          game.log.push(`Player ${payload.playerID} is ready for battle!`)
          
          if (game.playersReady['0'] && game.playersReady['1']) {
            game.phase = 'battle'
            game.currentPlayer = '0' // Reset to player 0 for fair turn order
            game.log.push('⚔️ BATTLE PHASE BEGINS! Player 0 gets the first turn.')
          } else {
            // Auto end turn after ready for battle in setup phase
            game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
            game.log.push(`Player ${payload.playerID} is ready. Turn passes to Player ${game.currentPlayer}.`)
          }
          game.lastUpdate = Date.now()
          break
          
        case 'toggleRetreatMode':
          // Only allow retreat after turn 10
          if (game.turn >= 10) {
            game.retreatModeActive = !game.retreatModeActive
            game.log.push(game.retreatModeActive ? '🚨 Retreat mode ACTIVATED!' : 'Retreat mode deactivated.')
          }
          game.lastUpdate = Date.now()
          break
          
        case 'retreatUnit':
          if (!payload?.unitId || payload?.targetQ === undefined || payload?.targetR === undefined) {
            return NextResponse.json({ 
              error: 'Missing required fields for retreatUnit: unitId, targetQ, targetR' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const unit = game.units.find(u => u.id === payload.unitId)
          
          if (!unit || unit.ownerID !== payload.playerID) {
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
          
          if (!game.retreatModeActive) {
            return NextResponse.json({ 
              error: 'Retreat mode is not active' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Check if target is an extraction hex
          const isExtraction = game.extractionHexes.some(h => h.q === payload.targetQ && h.r === payload.targetR)
          if (!isExtraction) {
            return NextResponse.json({ 
              error: 'Target is not a valid extraction point' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Check if unit can reach it
          const reachable = getReachableHexes(unit, game.hexes, game.units, game.terrainMap)
          const canReach = reachable.some(h => h.q === payload.targetQ && h.r === payload.targetR)
          
          if (!canReach) {
            return NextResponse.json({ 
              error: 'Unit cannot reach extraction point' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Remove unit (retreat successful)
          const unitIndex = game.units.findIndex(u => u.id === payload.unitId)
          game.units.splice(unitIndex, 1)
          
          game.log.push(`Player ${payload.playerID}'s ${unit.name} successfully retreated!`)
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
      
      let victoryInfo = null
      
      // Attack & Defend mode victory conditions
      if (game.gameMode === 'ATTACK_DEFEND') {
        // Defender (Player 1) wins if they hold objective for required turns
        if (game.objectiveControl['1'] >= game.turnLimit) {
          victoryInfo = {
            winner: '1',
            turn: game.turn || 1,
            victoryType: 'objective_defense',
            message: `Player 1 (Defender) wins by holding Paris for ${game.turnLimit} turns!`
          }
        }
        
        // Attacker (Player 0) wins if they capture all objective hexes
        const p0ControlsAll = game.objectiveHexes.every(objHex => {
          const unitOnHex = aliveUnits.find(u => u.q === objHex.q && u.r === objHex.r)
          return unitOnHex && unitOnHex.ownerID === '0'
        })
        
        if (p0ControlsAll && game.objectiveControl['0'] >= 3) {
          victoryInfo = {
            winner: '0',
            turn: game.turn || 1,
            victoryType: 'objective_capture',
            message: `Player 0 (Attacker) wins by capturing Paris!`
          }
        }
        
        // Elimination still works as alternate victory
        if (p1Alive === 0) {
          victoryInfo = {
            winner: '0',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 0 wins by eliminating all defenders!`
          }
        }
        if (p0Alive === 0) {
          victoryInfo = {
            winner: '1',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 1 wins by eliminating all attackers!`
          }
        }
      } else {
        // Standard ELIMINATION mode
        if (p0Alive === 0 && p1Alive > 0) {
          victoryInfo = {
            winner: '1',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 1 wins by eliminating all enemy units in ${game.turn || 1} turns!`
          }
        } else if (p1Alive === 0 && p0Alive > 0) {
          victoryInfo = {
            winner: '0',
            turn: game.turn || 1,
            victoryType: 'elimination',
            message: `Player 0 wins by eliminating all enemy units in ${game.turn || 1} turns!`
          }
        } else if (p0Alive === 0 && p1Alive === 0) {
          victoryInfo = {
            draw: true,
            turn: game.turn || 1,
            victoryType: 'mutual_destruction',
            message: `Draw! Both players eliminated in ${game.turn || 1} turns!`
          }
        } else if ((game.turn || 1) >= 50) {
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
