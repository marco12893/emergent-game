// Vercel KV game state management
import { kv } from '@vercel/kv'

// Create a new game
const createGame = async (gameId) => {
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
  
  const game = {
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
  
  // Store in Vercel KV with 24 hour TTL
  await kv.set(`game:${gameId}`, game, { ex: 86400 })
  
  return game
}

// Export functions to manage game state
export const getGames = async () => {
  try {
    const gameKeys = await kv.keys('game:*');
    if (gameKeys.length === 0) return {};
    
    // Fetch all games in ONE network request
    const gameData = await kv.mget(...gameKeys); 
    const games = {};
    
    gameKeys.forEach((key, index) => {
      const gameId = key.replace('game:', '');
      if (gameData[index]) games[gameId] = gameData[index];
    });
    
    return games;
  } catch (err) {
    console.error('Error getting games:', err);
    return {};
  }
}

export const getGame = async (gameId) => {
  try {
    const game = await kv.get(`game:${gameId}`)
    return game
  } catch (err) {
    console.error('Error getting game:', err)
    return null
  }
}

export const setGame = async (gameId, game) => {
  try {
    game.lastUpdate = Date.now();
    await kv.set(`game:${gameId}`, game, { ex: 86400 });
  } catch (err) {
    console.error('Error setting game:', err);
    throw err; // Allow the API route to handle the failure
  }
}

export const createNewGame = createGame
