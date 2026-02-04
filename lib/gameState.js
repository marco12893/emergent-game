// Vercel KV game state management
import { kv } from '@vercel/kv'

// Configuration for game cleanup
const CLEANUP_INTERVAL_MINUTES = 2 // Production: Run cleanup every 2 minutes
const INACTIVE_TIMEOUT_MINUTES = 30 // Production: Remove games inactive for 30 minutes

// Global cleanup tracking
let lastCleanupTime = 0
const CLEANUP_INTERVAL = CLEANUP_INTERVAL_MINUTES * 60 * 1000 // Convert to milliseconds

const MAP_DEFINITIONS = {
  MAP_1: {
    id: 'MAP_1',
    name: 'Map 1 (Original)',
    width: 6,
    height: 4,
  },
  MAP_2: {
    id: 'MAP_2',
    name: 'Map 2 (Coastal Divide)',
    width: 8,
    height: 5,
  },
}

const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: false },
  FOREST: { name: 'Forest', defenseBonus: 10, moveCost: 1, passable: true, waterOnly: false },
  HILLS: { name: 'Hills', defenseBonus: 8, moveCost: 2, passable: true, waterOnly: false },
  MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false },
  WATER: { name: 'Water', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: true },
}

const getSpawnZoneConfig = (width) => ({
  player0MaxQ: -(width - 1),
  player1MinQ: width - 2,
})

const generateTerrainMap = (mapId, width, height, hexes) => {
  const terrainMap = {}

  if (mapId === 'MAP_2') {
    const oceanThreshold = -Math.ceil(height * 0.5)
    const hillPositions = [
      { q: -2, r: 1 }, { q: -1, r: 0 }, { q: 1, r: 0 }, { q: 2, r: -1 },
      { q: 0, r: 2 }, { q: 3, r: 1 },
    ]
    const forestPositions = [
      { q: -5, r: 1 }, { q: -4, r: 2 }, { q: 4, r: -1 }, { q: 5, r: 0 },
      { q: -1, r: 3 }, { q: 1, r: 2 },
    ]
    const mountainPositions = [
      { q: 0, r: -1 }, { q: 1, r: -2 }, { q: -1, r: 0 },
    ]

    hexes.forEach(({ q, r }) => {
      let terrain = 'PLAIN'

      if (r <= oceanThreshold) {
        terrain = 'WATER'
      } else if (mountainPositions.some(pos => pos.q === q && pos.r === r)) {
        terrain = 'MOUNTAIN'
      } else if (hillPositions.some(pos => pos.q === q && pos.r === r)) {
        terrain = 'HILLS'
      } else if (forestPositions.some(pos => pos.q === q && pos.r === r)) {
        terrain = 'FOREST'
      }

      terrainMap[`${q},${r}`] = terrain
    })

    return terrainMap
  }

  // MAP_1 (original)
  hexes.forEach(({ q, r }) => {
    let terrain = 'PLAIN'

    const mountainPositions = [
      { q: 0, r: -2 }, { q: 0, r: -1 }, { q: 1, r: -2 },
      { q: -1, r: 0 }, { q: 0, r: 0 },
    ]
    if (mountainPositions.some(pos => pos.q === q && pos.r === r)) {
      terrain = 'MOUNTAIN'
    }

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
  })

  return terrainMap
}

// Create a new game
const createGame = async (gameId, mapId = 'MAP_1') => {
  const mapConfig = MAP_DEFINITIONS[mapId] || MAP_DEFINITIONS.MAP_1
  const { width: MAP_WIDTH, height: MAP_HEIGHT } = mapConfig

  const hexes = []
  for (let r = -MAP_HEIGHT; r <= MAP_HEIGHT; r++) {
    const rOffset = Math.floor(r / 2)
    for (let q = -MAP_WIDTH - rOffset; q <= MAP_WIDTH - rOffset; q++) {
      hexes.push({ q, r, s: -q - r })
    }
  }

  const terrainMap = generateTerrainMap(mapConfig.id, MAP_WIDTH, MAP_HEIGHT, hexes)
  const spawnZones = getSpawnZoneConfig(MAP_WIDTH)

  const game = {
    id: gameId,
    mapId: mapConfig.id,
    mapConfig: {
      id: mapConfig.id,
      name: mapConfig.name,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      spawnZones,
    },
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
    lastActivity: Date.now(),
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
    game.lastActivity = Date.now();
    await kv.set(`game:${gameId}`, game, { ex: 86400 });
  } catch (err) {
    console.error('Error setting game:', err);
    throw err; // Allow the API route to handle the failure
  }
}

// Clean up inactive games (time-based deterministic)
export const cleanupInactiveGames = async () => {
  try {
    const currentTime = Date.now();
    
    // Only run cleanup if enough time has passed
    if (currentTime - lastCleanupTime < CLEANUP_INTERVAL) {
      return 0; // Not time yet
    }
    
    console.log('🧹 Starting scheduled cleanup of inactive games...');
    const games = await getGames();
    const inactiveTimeout = INACTIVE_TIMEOUT_MINUTES * 60 * 1000; // Convert to milliseconds
    let cleanedCount = 0;

    for (const [gameId, game] of Object.entries(games)) {
      // Use lastActivity if available, fallback to lastUpdate, then current time
      const lastActivity = game.lastActivity || game.lastUpdate || currentTime;
      const inactiveTime = currentTime - lastActivity;

      if (inactiveTime > inactiveTimeout) {
        console.log(`🗑️ Removing inactive game ${gameId} (inactive for ${Math.round(inactiveTime / 60000)} minutes)`);
        await kv.del(`game:${gameId}`);
        cleanedCount++;
      }
    }

    lastCleanupTime = currentTime;
    console.log(`✅ Cleanup completed. Removed ${cleanedCount} inactive games.`);
    return cleanedCount;
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    return 0;
  }
}

// Force cleanup (ignores time interval)
export const forceCleanupInactiveGames = async () => {
  try {
    console.log('🧹 Starting forced cleanup of inactive games...');
    const games = await getGames();
    const currentTime = Date.now();
    const inactiveTimeout = INACTIVE_TIMEOUT_MINUTES * 60 * 1000;
    let cleanedCount = 0;

    for (const [gameId, game] of Object.entries(games)) {
      const lastActivity = game.lastActivity || game.lastUpdate || currentTime;
      const inactiveTime = currentTime - lastActivity;

      if (inactiveTime > inactiveTimeout) {
        console.log(`🗑️ Removing inactive game ${gameId} (inactive for ${Math.round(inactiveTime / 60000)} minutes)`);
        await kv.del(`game:${gameId}`);
        cleanedCount++;
      }
    }

    console.log(`✅ Forced cleanup completed. Removed ${cleanedCount} inactive games.`);
    return cleanedCount;
  } catch (err) {
    console.error('❌ Error during forced cleanup:', err);
    return 0;
  }
}

export const createNewGame = createGame
