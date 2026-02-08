// Vercel KV game state management
import { kv } from '@vercel/kv'
import { DEFAULT_MAP_ID, generateMapData, getMapConfig } from '@/game/maps'

// Configuration for game cleanup
const CLEANUP_INTERVAL_MINUTES = 2 // Run cleanup every 2 minutes
const INACTIVE_TIMEOUT_MINUTES = 30 // Remove games inactive for 30 minutes

// Global cleanup tracking
let lastCleanupTime = 0
const CLEANUP_INTERVAL = CLEANUP_INTERVAL_MINUTES * 60 * 1000 // Convert to milliseconds

// Create a new game
const createGame = async (gameId, mapId = DEFAULT_MAP_ID, isWinter = false, teamMode = false) => {
  const mapConfig = getMapConfig(mapId)
  const { hexes, terrainMap } = generateMapData(mapId)
  const maxPlayers = teamMode ? 4 : 2
  const attackerId = teamMode ? 'blue-green' : '0'
  const defenderId = teamMode ? 'red-yellow' : '1'
  
  const TERRAIN_TYPES = {
    PLAIN: { name: 'Plain', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: false },
    FOREST: { name: 'Forest', defenseBonus: 10, moveCost: 1, passable: true, waterOnly: false },
    MOUNTAIN: { name: 'Mountain', defenseBonus: 0, moveCost: Infinity, passable: false, waterOnly: false },
    WATER: { name: 'Water', defenseBonus: 0, moveCost: 1, passable: true, waterOnly: true },
    HILLS: { name: 'Hills', defenseBonus: 8, moveCost: 2, passable: true, waterOnly: false },
  }
  
  const playersReady = {}
  for (let i = 0; i < maxPlayers; i += 1) {
    playersReady[String(i)] = false
  }

  const game = {
    id: gameId,
    hexes,
    terrainMap,
    terrainTypes: TERRAIN_TYPES,
    mapId: mapConfig.id,
    mapSize: mapConfig.size,
    isWinter,
    teamMode,
    maxPlayers,
    attackerId,
    defenderId,
    players: {},
    currentPlayer: '0',
    phase: 'setup',
    units: [],
    selectedUnitId: null,
    leaderId: null,
    spectators: [],
    playersReady,
    log: ['Game started! Place your units in your spawn zone.'],
    chatMessages: [],
    inactivePlayers: [],
    objectiveControl: { [attackerId]: 0, [defenderId]: 0 },
    lastUpdate: Date.now(),
    lastActivity: Date.now() // Track activity for cleanup
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
    game.lastActivity = Date.now(); // Update activity on every save
    await kv.set(`game:${gameId}`, game, { ex: 86400 });
  } catch (err) {
    console.error('Error setting game:', err);
    throw err; // Allow the API route to handle the failure
  }
}

export const createNewGame = createGame

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
