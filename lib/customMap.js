const ALLOWED_TERRAINS = new Set(['PLAIN', 'FOREST', 'MOUNTAIN', 'HILLS', 'WATER', 'CITY', 'BARRACKS', 'CASTLE', 'CATHEDRAL', 'FARM', 'LIBRARY', 'MOSQUE', 'HOSPITAL', 'UNIVERSITY', 'WALL', 'FLOOR'])

const isValidCoordinate = (value) => Number.isInteger(value) && value >= -100 && value <= 100

const sanitizeZone = (zone = []) => {
  if (!Array.isArray(zone)) return []
  const seen = new Set()
  return zone
    .filter((hex) => isValidCoordinate(hex?.q) && isValidCoordinate(hex?.r))
    .map((hex) => ({ q: hex.q, r: hex.r }))
    .filter((hex) => {
      const key = `${hex.q},${hex.r}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export const sanitizeCustomMap = (customMap) => {
  if (!customMap || typeof customMap !== 'object') return null

  const width = Number(customMap?.size?.width)
  const height = Number(customMap?.size?.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || width > 20 || height < 3 || height > 12) {
    return null
  }

  const hexes = []
  const defaultTerrainMap = {}
  for (let r = -height; r <= height; r++) {
    const rOffset = Math.floor(r / 2)
    for (let q = -width - rOffset; q <= width - rOffset; q++) {
      hexes.push({ q, r, s: -q - r })
      defaultTerrainMap[`${q},${r}`] = 'PLAIN'
    }
  }

  const terrainMap = { ...defaultTerrainMap }
  if (customMap.terrainMap && typeof customMap.terrainMap === 'object') {
    Object.entries(customMap.terrainMap).forEach(([key, terrain]) => {
      if (terrainMap[key] && ALLOWED_TERRAINS.has(terrain)) {
        terrainMap[key] = terrain
      }
    })
  }

  const tileMap = {}
  if (customMap.tileMap && typeof customMap.tileMap === 'object') {
    Object.entries(customMap.tileMap).forEach(([key, tile]) => {
      if (!terrainMap[key] || typeof tile !== 'string') return
      if (!tile.startsWith('/tiles/')) return
      tileMap[key] = tile
    })
  }

  const deploymentZones = {
    blue: sanitizeZone(customMap?.deploymentZones?.blue),
    red: sanitizeZone(customMap?.deploymentZones?.red),
  }

  const validHexSet = new Set(hexes.map((hex) => `${hex.q},${hex.r}`))
  deploymentZones.blue = deploymentZones.blue.filter((hex) => validHexSet.has(`${hex.q},${hex.r}`))
  deploymentZones.red = deploymentZones.red.filter((hex) => validHexSet.has(`${hex.q},${hex.r}`))

  return {
    id: 'CUSTOM',
    name: typeof customMap?.name === 'string' && customMap.name.trim() ? customMap.name.trim().slice(0, 60) : 'Custom Map',
    description: 'User-created custom battleground.',
    size: { width, height },
    hexes,
    terrainMap,
    tileMap,
    deploymentZones,
  }
}

export const parseImportedCustomMap = (payload) => {
  if (!payload || typeof payload !== 'object') return null

  const candidate =
    payload?.map && typeof payload.map === 'object'
      ? payload.map
      : payload?.customMap && typeof payload.customMap === 'object'
        ? payload.customMap
        : payload

  return sanitizeCustomMap(candidate)
}
