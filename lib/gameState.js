// Shared game state for all API routes
let games = {}

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

// Export functions to manage game state
export const getGames = () => games
export const getGame = (gameId) => games[gameId]
export const setGame = (gameId, game) => { games[gameId] = game }
export const createNewGame = createGame
