export const DEFAULT_MAP_ID = 'MAP_1'

export const MAPS = {
  MAP_1: {
    id: 'MAP_1',
    name: 'Map 1 (Heartland)',
    description: 'Original battle map with central mountains and forests.',
    size: { width: 6, height: 4 },
  },
  MAP_2: {
    id: 'MAP_2',
    name: 'Map 2 (Northern Coast)',
    description: 'Larger coastal map with northern ocean and rolling hills.',
    size: { width: 8, height: 5 },
  },
}

export const getMapConfig = (mapId) => MAPS[mapId] || MAPS[DEFAULT_MAP_ID]

export const generateMapData = (mapId = DEFAULT_MAP_ID) => {
  const mapConfig = getMapConfig(mapId)
  const { width: MAP_WIDTH, height: MAP_HEIGHT } = mapConfig.size
  const hexes = []
  const terrainMap = {}

  const map2Forests = new Set([
    '-6,1', '-5,1', '-5,0', '-4,1', '-4,0',
    '5,1', '6,1', '6,2', '5,2', '4,2',
    '-1,4', '0,4', '1,4', '2,4',
    '-2,2', '-1,2',
  ])
  const map2Hills = new Set([
    '-5,2', '-4,2', '-4,3', '-3,3',
    '2,3', '3,3', '4,3', '5,3',
    '1,1', '2,1',
  ])
  const map2Mountains = new Set([
    '-2,3', '-1,3', '0,2', '1,2', '1,3',
    '3,1', '4,1', '4,0',
  ])

  for (let r = -MAP_HEIGHT; r <= MAP_HEIGHT; r++) {
    const rOffset = Math.floor(r / 2)
    for (let q = -MAP_WIDTH - rOffset; q <= MAP_WIDTH - rOffset; q++) {
      const s = -q - r
      hexes.push({ q, r, s })

      let terrain = 'PLAIN'

      if (mapConfig.id === 'MAP_2') {
        const key = `${q},${r}`

        // Northern ocean with an irregular coastline
        if (r <= -2) {
          terrain = 'WATER'
        } else if (r === -1 && (q <= -5 || q >= 4 || q === -2 || q === 1)) {
          terrain = 'WATER'
        } else if (map2Mountains.has(key)) {
          terrain = 'MOUNTAIN'
        } else if (map2Hills.has(key)) {
          terrain = 'HILLS'
        } else if (map2Forests.has(key)) {
          terrain = 'FOREST'
        }
      } else {
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

      }

      terrainMap[`${q},${r}`] = terrain
    }
  }

  return {
    hexes,
    terrainMap,
    mapConfig,
  }
}
