import { NextResponse } from 'next/server'

// Game state storage
const games = {}

// Create a new game
const createGame = (gameId) => {
  console.log('Creating new game:', gameId)
  
  // Generate hex map data
  const hexes = []
  const terrainMap = {}
  const MAP_WIDTH = 6
  const MAP_HEIGHT = 4
  
  // Terrain types with their properties
  const TERRAIN_TYPES = {
    PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true },
    FOREST: { name: 'Forest', defenseBonus: 2, moveCost: 1, passable: true },
    MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false },
  }
  
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
  
  games[gameId] = {
    id: gameId,
    hexes,
    terrainMap,
    terrainTypes: TERRAIN_TYPES,
    players: {},
    currentPlayer: '0',
    phase: 'setup',
    units: [],
    selectedUnitId: null,
    playersReady: { '0': false, '1': false },
    log: ['Game started! Place your units in your spawn zone.'],
    lastUpdate: Date.now()
  }
  return games[gameId]
}

// Handle GET requests
export async function GET(request) {
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  
  // Health check
  if (pathParts[pathParts.length - 1] === 'health') {
    return NextResponse.json({ status: 'OK', games: Object.keys(games) })
  }
  
  // Get game state
  const gameId = pathParts[pathParts.length - 1]
  if (gameId && games[gameId]) {
    return NextResponse.json(games[gameId])
  }
  
  return NextResponse.json({ error: 'Game not found' }, { status: 404 })
}

// Handle POST requests
export async function POST(request) {
  const body = await request.json()
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const action = pathParts[pathParts.length - 1]
  
  if (action === 'join') {
    const { gameId, playerID } = body
    
    if (!games[gameId]) {
      createGame(gameId)
    }
    
    const game = games[gameId]
    game.players[playerID] = { joined: true, joinTime: Date.now() }
    
    console.log(`🎮 Player ${playerID} joined game ${gameId}`)
    
    return NextResponse.json({ success: true, gameState: game })
  }
  
  if (action === 'action') {
    const { gameId, action: gameAction, payload } = body
    
    if (!games[gameId]) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    
    const game = games[gameId]
    
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
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
