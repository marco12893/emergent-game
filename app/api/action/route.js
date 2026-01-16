import { NextResponse } from 'next/server'
import { getGame } from '@/lib/gameState'

export async function POST(request) {
  const body = await request.json()
  const { gameId, action: gameAction, payload } = body
  
  const game = getGame(gameId)
  
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  
  // Handle different game actions
  switch (gameAction) {
    case 'placeUnit':
      // Unit placement logic
      const unitStats = {
        SWORDSMAN: { maxHP: 100, attackPower: 25, movePoints: 2, range: 1 },
        ARCHER: { maxHP: 60, attackPower: 30, movePoints: 1, range: 2 },
        KNIGHT: { maxHP: 150, attackPower: 30, movePoints: 3, range: 1 }
      }
      
      const stats = unitStats[payload.unitType]
      const newUnit = {
        id: Date.now().toString(),
        type: payload.unitType,
        name: payload.unitType.charAt(0) + payload.unitType.slice(1).toLowerCase(),
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
        movingUnit.q = payload.targetQ
        movingUnit.r = payload.targetR
        movingUnit.s = -payload.targetQ - payload.targetR
        movingUnit.hasMoved = true
        game.log.push(`Player ${payload.playerID}'s ${movingUnit.name} moved to (${payload.targetQ}, ${payload.targetR})`)
        game.lastUpdate = Date.now()
      }
      break
      
    case 'attackUnit':
      const attacker = game.units.find(u => u.id === payload.attackerId)
      const target = game.units.find(u => u.id === payload.targetId)
      
      if (attacker && target && !attacker.hasAttacked) {
        const damage = attacker.attackPower
        target.currentHP -= damage
        attacker.hasAttacked = true
        
        game.log.push(`Player ${payload.playerID}'s ${attacker.name} hit ${target.name} for ${damage} damage!`)
        
        if (target.currentHP <= 0) {
          game.units = game.units.filter(u => u.id !== target.id)
          game.log.push(`${target.name} was defeated!`)
        }
        
        game.lastUpdate = Date.now()
      }
      break
      
    case 'endTurn':
      game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
      game.units.forEach(unit => {
        unit.hasMoved = false
        unit.hasAttacked = false
      })
      game.log.push(`Player ${payload.playerID} ended turn. Player ${game.currentPlayer}'s turn begins.`)
      game.lastUpdate = Date.now()
      break
      
    case 'readyForBattle':
      game.playersReady[payload.playerID] = true
      game.log.push(`Player ${payload.playerID} is ready for battle!`)
      
      if (game.playersReady['0'] && game.playersReady['1']) {
        game.phase = 'battle'
        game.log.push('⚔️ BATTLE PHASE BEGINS!')
      }
      game.lastUpdate = Date.now()
      break
  }
  
  console.log('📡 Broadcasting updated game state')
  return NextResponse.json({ success: true, gameState: game })
}
