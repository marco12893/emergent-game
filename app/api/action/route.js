import { NextResponse } from 'next/server'
import { getGame, saveGame } from '@/lib/gameState'

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
    
    console.log(`🎮 Action: ${gameAction} - Game: ${gameId}`)
    
    // Get game from storage
    const game = await getGame(gameId)
    
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Handle different game actions
    switch (gameAction) {
      case 'placeUnit':
        // Unit placement logic
        const unitStats = {
          SWORDSMAN: { maxHP: 100, attackPower: 25, movePoints: 2, range: 1, emoji: '⚔️' },
          ARCHER: { maxHP: 60, attackPower: 30, movePoints: 1, range: 2, emoji: '🏹' },
          KNIGHT: { maxHP: 150, attackPower: 30, movePoints: 3, range: 1, emoji: '🐴' }
        }
        
        const stats = unitStats[payload.unitType]
        if (!stats) {
          return NextResponse.json({ error: 'Invalid unit type' }, { status: 400 })
        }
        
        const newUnit = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: payload.unitType,
          name: payload.unitType.charAt(0) + payload.unitType.slice(1).toLowerCase(),
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
          hasMoved: false,
          hasAttacked: false
        }
        
        game.units.push(newUnit)
        game.log.push(`Player ${payload.playerID} placed ${newUnit.name} at (${payload.q}, ${payload.r})`)
        game.lastUpdate = Date.now()
        break
        
      case 'removeUnit':
        game.units = game.units.filter(u => u.id !== payload.unitId)
        game.log.push(`Player ${payload.playerID} removed a unit`)
        game.lastUpdate = Date.now()
        break
        
      case 'selectUnit':
        game.selectedUnitId = payload.unitId
        break
        
      case 'deselectUnit':
        game.selectedUnitId = null
        break
        
      case 'moveUnit':
        const movingUnit = game.units.find(u => u.id === payload.unitId)
        if (movingUnit && !movingUnit.hasMoved) {
          const oldQ = movingUnit.q
          const oldR = movingUnit.r
          movingUnit.q = payload.targetQ
          movingUnit.r = payload.targetR
          movingUnit.s = -payload.targetQ - payload.targetR
          movingUnit.hasMoved = true
          game.log.push(`Player ${payload.playerID}'s ${movingUnit.name} moved from (${oldQ}, ${oldR}) to (${payload.targetQ}, ${payload.targetR})`)
          game.lastUpdate = Date.now()
        }
        break
        
      case 'attackUnit':
        const attacker = game.units.find(u => u.id === payload.attackerId)
        const target = game.units.find(u => u.id === payload.targetId)
        
        if (attacker && target && !attacker.hasAttacked) {
          // Calculate damage with terrain defense bonus
          const targetHexKey = `${target.q},${target.r}`
          const terrain = game.terrainMap[targetHexKey] || 'PLAIN'
          const terrainData = game.terrainTypes[terrain]
          const defenseBonus = terrainData?.defenseBonus || 0
          
          const damage = Math.max(1, attacker.attackPower - defenseBonus)
          target.currentHP -= damage
          attacker.hasAttacked = true
          
          game.log.push(`Player ${payload.playerID}'s ${attacker.name} hit ${target.name} for ${damage} damage!`)
          
          if (target.currentHP <= 0) {
            game.units = game.units.filter(u => u.id !== target.id)
            game.log.push(`${target.name} was defeated!`)
          }
          
          // Counter-attack for melee (if target is still alive and attacker is in melee range)
          if (target.currentHP > 0 && attacker.range === 1) {
            const distance = Math.max(
              Math.abs(attacker.q - target.q),
              Math.abs(attacker.r - target.r),
              Math.abs(attacker.s - target.s)
            )
            
            if (distance === 1) {
              const counterDamage = Math.max(1, Math.floor(target.attackPower * 0.5))
              attacker.currentHP -= counterDamage
              game.log.push(`${target.name} counter-attacked for ${counterDamage} damage!`)
              
              if (attacker.currentHP <= 0) {
                game.units = game.units.filter(u => u.id !== attacker.id)
                game.log.push(`${attacker.name} was defeated!`)
              }
            }
          }
          
          game.lastUpdate = Date.now()
        }
        break
        
      case 'endTurn':
        // Reset unit action flags for current player only
        game.units.forEach(unit => {
          if (unit.ownerID === payload.playerID) {
            unit.hasMoved = false
            unit.hasAttacked = false
          }
        })
        
        game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
        game.selectedUnitId = null
        game.log.push(`Player ${payload.playerID} ended turn. Player ${game.currentPlayer}'s turn begins.`)
        game.lastUpdate = Date.now()
        break
        
      case 'readyForBattle':
        game.playersReady[payload.playerID] = true
        game.log.push(`Player ${payload.playerID} is ready for battle!`)
        
        // Check if both players are ready
        const p0Units = game.units.filter(u => u.ownerID === '0').length
        const p1Units = game.units.filter(u => u.ownerID === '1').length
        
        if (game.playersReady['0'] && game.playersReady['1'] && p0Units > 0 && p1Units > 0) {
          game.phase = 'battle'
          game.currentPlayer = '0' // Reset to player 0's turn
          game.log.push('⚔️ BATTLE PHASE BEGINS!')
        }
        game.lastUpdate = Date.now()
        break
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    
    // Save updated game state to storage
    await saveGame(gameId, game)
    
    console.log(`✅ Action ${gameAction} completed for game ${gameId}`)
    
    return NextResponse.json({ success: true, gameState: game }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error) {
    console.error('❌ Error in /api/action:', error)
    return NextResponse.json({ 
      error: 'Action failed',
      message: error.message 
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
