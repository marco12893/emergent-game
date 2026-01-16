const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());

// Game state storage
const games = {};

// Create a new game
const createGame = (gameId) => {
  console.log('Creating new game:', gameId);
  
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
  };
  return games[gameId];
};

// Join game endpoint
app.post('/api/join', (req, res) => {
  const { gameId, playerID } = req.body;
  console.log('🎮 Join request:', { gameId, playerID });
  
  if (!games[gameId]) {
    createGame(gameId);
  }
  
  const game = games[gameId];
  game.players[playerID] = {
    connected: true,
    lastSeen: Date.now()
  };
  
  console.log(`✅ Player ${playerID} joined game ${gameId}`);
  
  res.json({ success: true, gameState: game });
});

// Get game state endpoint
app.get('/api/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games[gameId];
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json(game);
});

// Game action endpoint
app.post('/api/action', (req, res) => {
  const { gameId, action, payload } = req.body;
  console.log('🎮 Action received:', { gameId, action, payload });
  
  const game = games[gameId];
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  // Handle different actions
  switch (action) {
    case 'placeUnit':
      // Validate unit type
      const unitTypes = { SWORDSMAN: '⚔️', ARCHER: '🏹', KNIGHT: '🐴' }
      if (!unitTypes[payload.unitType]) {
        return res.status(400).json({ error: 'Invalid unit type' })
      }
      
      // Check spawn zone
      const isInSpawnZone = (q, r, playerID) => {
        if (playerID === '0') {
          return q <= -5
        } else {
          return q >= 4
        }
      }
      
      if (!isInSpawnZone(payload.q, payload.r, payload.playerID)) {
        return res.status(400).json({ error: 'Not in spawn zone' })
      }
      
      // Check if hex exists and is not occupied
      const hexExists = game.hexes.some(h => h.q === payload.q && h.r === payload.r)
      if (!hexExists) {
        return res.status(400).json({ error: 'Hex does not exist' })
      }
      
      const isOccupied = game.units.some(u => u.q === payload.q && u.r === payload.r)
      if (isOccupied) {
        return res.status(400).json({ error: 'Hex is occupied' })
      }
      
      // Create unit with full stats
      const unitStats = {
        SWORDSMAN: { maxHP: 100, attackPower: 25, movePoints: 2, range: 1 },
        ARCHER: { maxHP: 60, attackPower: 30, movePoints: 1, range: 2 }, // Buffed from 20 to 30
        KNIGHT: { maxHP: 150, attackPower: 30, movePoints: 3, range: 1 }  // Nerfed from 35 to 30
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
        emoji: unitTypes[payload.unitType],
        hasMoved: false,
        hasAttacked: false
      }
      game.units.push(newUnit)
      game.log.push(`Player ${payload.playerID} placed ${payload.unitType} at (${payload.q}, ${payload.r})`)
      game.lastUpdate = Date.now()
      console.log('✅ Unit placed:', newUnit)
      break
      
    case 'removeUnit':
      const unitIndex = game.units.findIndex(u => u.id === payload.unitId && u.ownerID === payload.playerID)
      if (unitIndex === -1) {
        return res.status(400).json({ error: 'Unit not found' })
      }
      const unit = game.units[unitIndex]
      game.units.splice(unitIndex, 1)
      game.log.push(`Player ${payload.playerID} removed ${unit.name} from (${unit.q}, ${unit.r})`)
      game.lastUpdate = Date.now()
      break
      
    case 'endTurn':
      // Reset unit action flags for current player
      game.units.forEach(unit => {
        if (unit.ownerID === payload.playerID) {
          unit.hasMoved = false
          unit.hasAttacked = false
        }
      })
      
      game.selectedUnitId = null
      game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
      game.log.push(`Player ${payload.playerID} ended their turn.`)
      game.lastUpdate = Date.now()
      console.log('🔄 Turn ended. Current player:', game.currentPlayer)
      break
      
    case 'readyForBattle':
      game.playersReady[payload.playerID] = true
      game.log.push(`Player ${payload.playerID} is ready for battle!`)
      game.lastUpdate = Date.now()
      
      // Check if both players are ready and have units
      const p0Units = game.units.filter(u => u.ownerID === '0').length
      const p1Units = game.units.filter(u => u.ownerID === '1').length
      
      if (game.playersReady['0'] && game.playersReady['1'] && p0Units > 0 && p1Units > 0) {
        game.phase = 'battle'
        game.log.push('⚔️ Battle phase begins!')
        console.log('⚔️ Battle phase started')
      }
      break
      
    case 'selectUnit':
      const unitToSelect = game.units.find(u => u.id === payload.unitId)
      if (unitToSelect && unitToSelect.ownerID === payload.playerID) {
        game.selectedUnitId = payload.unitId
      }
      break
      
    case 'deselectUnit':
      game.selectedUnitId = null
      break
      
    case 'moveUnit':
      const movingUnit = game.units.find(u => u.id === payload.unitId)
      if (!movingUnit || movingUnit.ownerID !== payload.playerID || movingUnit.hasMoved) {
        return res.status(400).json({ error: 'Invalid move' })
      }
      
      // Calculate distance using hex distance
      const moveDistance = Math.max(
        Math.abs(movingUnit.q - payload.targetQ),
        Math.abs(movingUnit.r - payload.targetR),
        Math.abs(movingUnit.s - (-payload.targetQ - payload.targetR))
      )
      
      // Check if unit has enough movement points
      if (moveDistance > movingUnit.movePoints) {
        return res.status(400).json({ error: 'Target too far - not enough movement points' })
      }
      
      // Simple movement validation (check if hex is empty and exists)
      const targetHexExists = game.hexes.some(h => h.q === payload.targetQ && h.r === payload.targetR)
      const targetOccupied = game.units.some(u => u.q === payload.targetQ && u.r === payload.targetR)
      
      if (!targetHexExists || targetOccupied) {
        return res.status(400).json({ error: 'Invalid target hex' })
      }
      
      movingUnit.q = payload.targetQ
      movingUnit.r = payload.targetR
      movingUnit.s = -payload.targetQ - payload.targetR
      movingUnit.hasMoved = true
      game.log.push(`Player ${payload.playerID}'s ${movingUnit.name} moved ${moveDistance} hexes to (${payload.targetQ}, ${payload.targetR})`)
      game.lastUpdate = Date.now()
      break
      
    case 'attackUnit':
      const attacker = game.units.find(u => u.id === payload.attackerId)
      const target = game.units.find(u => u.id === payload.targetId)
      
      if (!attacker || !target || attacker.ownerID !== payload.playerID || target.ownerID === payload.playerID || attacker.hasAttacked) {
        return res.status(400).json({ error: 'Invalid attack' })
      }
      
      // Simple distance check
      const distance = Math.max(
        Math.abs(attacker.q - target.q),
        Math.abs(attacker.r - target.r),
        Math.abs(attacker.s - target.s)
      )
      
      if (distance > attacker.range) {
        return res.status(400).json({ error: 'Target out of range' })
      }
      
      // Calculate damage with terrain defense bonus
      const targetHexKey = `${target.q},${target.r}`
      const terrain = game.terrainMap[targetHexKey] || 'PLAIN'
      const terrainData = game.terrainTypes[terrain]
      const defenseBonus = terrainData.defenseBonus
      
      const damage = Math.max(1, attacker.attackPower - defenseBonus)
      target.currentHP -= damage
      attacker.hasAttacked = true
      
      game.log.push(`Player ${payload.playerID}'s ${attacker.name} hit ${target.name} for ${damage} damage!`)
      
      if (target.currentHP <= 0) {
        game.units = game.units.filter(u => u.id !== target.id)
        game.log.push(`${target.name} was defeated!`)
      }
      
      // Counter-attack for melee (if target is still alive and attacker is in melee range)
      if (target.currentHP > 0 && attacker.range === 1 && distance === 1) {
        const counterDamage = Math.max(1, Math.floor(target.attackPower * 0.5))
        attacker.currentHP -= counterDamage
        game.log.push(`${target.name} counter-attacked for ${counterDamage} damage!`)
        
        if (attacker.currentHP <= 0) {
          game.units = game.units.filter(u => u.id !== attacker.id)
          game.log.push(`${attacker.name} was defeated!`)
        }
      }
      
      game.lastUpdate = Date.now()
      break
  }
  
  console.log('📡 Broadcasting updated game state');
  res.json({ success: true, gameState: game });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', games: Object.keys(games).length });
});

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'HTTP Game server is running!', games: Object.keys(games) });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 HTTP Game server running on port ${PORT}`);
  console.log(`🔗 Available at: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
  console.log(`🚀 Ready for Vercel deployment!`);
});
