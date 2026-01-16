import { kv } from '@vercel/kv'

// Fallback in-memory storage for local development without KV configured
let localGames = {}

// Check if Vercel KV is available
const isKVAvailable = () => {
  return process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
}

// Game TTL: 24 hours (in seconds)
const GAME_TTL = 86400

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
  
  return {
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
    lastUpdate: Date.now(),
    createdAt: Date.now()
  }
}

// Save game to Vercel KV or local storage
export const saveGame = async (gameId, gameState) => {
  try {
    if (isKVAvailable()) {
      // Store in Vercel KV with 24 hour TTL
      await kv.set(`game:${gameId}`, gameState, { ex: GAME_TTL })
      console.log(`✅ Game ${gameId} saved to Vercel KV`)
    } else {
      // Fallback to local storage
      localGames[gameId] = gameState
      console.log(`✅ Game ${gameId} saved to local storage (KV not available)`)
    }
  } catch (error) {
    console.error(`❌ Error saving game ${gameId}:`, error)
    // Fallback to local storage on error
    localGames[gameId] = gameState
  }
}

// Get game from Vercel KV or local storage
export const getGame = async (gameId) => {
  try {
    if (isKVAvailable()) {
      const game = await kv.get(`game:${gameId}`)
      if (game) {
        console.log(`✅ Game ${gameId} retrieved from Vercel KV`)
      }
      return game
    } else {
      // Fallback to local storage
      const game = localGames[gameId]
      if (game) {
        console.log(`✅ Game ${gameId} retrieved from local storage`)
      }
      return game
    }
  } catch (error) {
    console.error(`❌ Error getting game ${gameId}:`, error)
    // Fallback to local storage on error
    return localGames[gameId]
  }
}

// Get all games (for admin/debug purposes)
export const getAllGames = async () => {
  try {
    if (isKVAvailable()) {
      // Scan for all game keys
      const keys = await kv.keys('game:*')
      return keys.map(key => key.replace('game:', ''))
    } else {
      return Object.keys(localGames)
    }
  } catch (error) {
    console.error('❌ Error getting all games:', error)
    return Object.keys(localGames)
  }
}

// Delete game from storage
export const deleteGame = async (gameId) => {
  try {
    if (isKVAvailable()) {
      await kv.del(`game:${gameId}`)
      console.log(`✅ Game ${gameId} deleted from Vercel KV`)
    } else {
      delete localGames[gameId]
      console.log(`✅ Game ${gameId} deleted from local storage`)
    }
  } catch (error) {
    console.error(`❌ Error deleting game ${gameId}:`, error)
    delete localGames[gameId]
  }
}

// Create new game (wrapper that also saves)
export const createNewGame = async (gameId) => {
  const game = createGame(gameId)
  await saveGame(gameId, game)
  return game
}

// Get games object (for backwards compatibility - returns empty object)
export const getGames = () => {
  console.warn('⚠️  getGames() is deprecated with Vercel KV - use getAllGames() instead')
  return {}
}
