'use client'

import React, { useEffect, useMemo, useState } from 'react'
import GameBoard from '@/components/GameBoard'

const TERRAIN_OPTIONS = ['PLAIN', 'FOREST', 'MOUNTAIN', 'HILLS', 'WATER']

const getTileTerrainType = (tilePath = '') => {
  const value = tilePath.toLowerCase()
  if (value.includes('forest')) return 'FOREST'
  if (value.includes('mountain')) return 'MOUNTAIN'
  if (value.includes('hill')) return 'HILLS'
  if (value.includes('ocean') || value.includes('water')) return 'WATER'
  if (value.includes('grass') || value.includes('plain')) return 'PLAIN'
  return 'PLAIN'
}

const buildHexes = (width, height) => {
  const hexes = []
  for (let r = -height; r <= height; r++) {
    const rOffset = Math.floor(r / 2)
    for (let q = -width - rOffset; q <= width - rOffset; q++) {
      hexes.push({ q, r, s: -q - r })
    }
  }
  return hexes
}

const createEmptyMap = (width, height) => {
  const hexes = buildHexes(width, height)
  const terrainMap = {}
  hexes.forEach((hex) => {
    terrainMap[`${hex.q},${hex.r}`] = 'PLAIN'
  })
  return {
    id: 'CUSTOM',
    name: 'Custom Map',
    description: 'User-created custom battleground.',
    size: { width, height },
    hexes,
    terrainMap,
    tileMap: {},
    deploymentZones: { blue: [], red: [] },
  }
}

const getBoundsFromHexes = (hexes = []) => {
  if (!hexes.length) {
    return { width: 0, height: 0 }
  }

  let maxQ = 0
  let maxR = 0
  hexes.forEach((hex) => {
    maxQ = Math.max(maxQ, Math.abs(hex.q))
    maxR = Math.max(maxR, Math.abs(hex.r))
  })

  return {
    width: Math.max(1, maxQ),
    height: Math.max(1, maxR),
  }
}

const normalizeCustomMap = (map) => {
  const uniqueHexes = []
  const seen = new Set()

  ;(map?.hexes || []).forEach((hex) => {
    const q = Number(hex?.q)
    const r = Number(hex?.r)
    if (Number.isNaN(q) || Number.isNaN(r)) return
    const key = `${q},${r}`
    if (seen.has(key)) return
    seen.add(key)
    uniqueHexes.push({ q, r, s: -q - r })
  })

  const terrainMap = {}
  const tileMap = {}
  uniqueHexes.forEach((hex) => {
    const key = `${hex.q},${hex.r}`
    terrainMap[key] = map?.terrainMap?.[key] || 'PLAIN'
    if (map?.tileMap?.[key]) {
      tileMap[key] = map.tileMap[key]
    }
  })

  const deploymentZones = {
    blue: (map?.deploymentZones?.blue || []).filter((hex) => seen.has(`${hex.q},${hex.r}`)),
    red: (map?.deploymentZones?.red || []).filter((hex) => seen.has(`${hex.q},${hex.r}`)),
  }

  return {
    ...(map || {}),
    hexes: uniqueHexes,
    terrainMap,
    tileMap,
    deploymentZones,
    size: getBoundsFromHexes(uniqueHexes),
  }
}

export default function MapBuilderModal({ open, onClose, onApply, initialMap }) {
  const [width, setWidth] = useState(6)
  const [height, setHeight] = useState(4)
  const [mapData, setMapData] = useState(() => createEmptyMap(6, 4))
  const [tiles, setTiles] = useState([])
  const [selectedTerrain, setSelectedTerrain] = useState('PLAIN')
  const [selectedTile, setSelectedTile] = useState('')
  const [editMode, setEditMode] = useState('terrain')
  const [customQ, setCustomQ] = useState(0)
  const [customR, setCustomR] = useState(0)

  const filteredTiles = useMemo(
    () => tiles.filter((tile) => getTileTerrainType(tile) === selectedTerrain),
    [tiles, selectedTerrain]
  )

  useEffect(() => {
    if (!open) return
    if (initialMap?.size?.width && initialMap?.size?.height) {
      setWidth(initialMap.size.width)
      setHeight(initialMap.size.height)
      setMapData(normalizeCustomMap({
        ...initialMap,
        tileMap: initialMap.tileMap || {},
        deploymentZones: initialMap.deploymentZones || { blue: [], red: [] },
      }))
    } else {
      setMapData(createEmptyMap(6, 4))
      setWidth(6)
      setHeight(4)
    }
  }, [initialMap, open])

  useEffect(() => {
    if (!open) return
    fetch(`/api/tiles?ts=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const list = data?.tiles || []
        setTiles(list)
        if (!list.length) {
          setSelectedTile('')
          return
        }

        const matching = list.find((tile) => getTileTerrainType(tile) === selectedTerrain)
        setSelectedTile(matching || list[0])
      })
      .catch(() => setTiles([]))
  }, [open, selectedTerrain])

  useEffect(() => {
    if (!open || !filteredTiles.length) return
    if (!filteredTiles.includes(selectedTile)) {
      setSelectedTile(filteredTiles[0])
    }
  }, [filteredTiles, open, selectedTile])

  const resizeMap = () => {
    setMapData(createEmptyMap(width, height))
  }

  const addHexAtCoordinates = () => {
    setMapData((current) => {
      const q = Number(customQ)
      const r = Number(customR)
      if (Number.isNaN(q) || Number.isNaN(r)) return current

      const key = `${q},${r}`
      const exists = current.hexes.some((hex) => hex.q === q && hex.r === r)
      if (exists) return current

      const next = {
        ...current,
        hexes: [...current.hexes, { q, r, s: -q - r }],
        terrainMap: { ...current.terrainMap, [key]: selectedTerrain },
        tileMap: { ...(current.tileMap || {}) },
      }

      if (selectedTile) {
        next.tileMap[key] = selectedTile
      }

      return normalizeCustomMap(next)
    })
  }

  const removeHexAtCoordinates = () => {
    setMapData((current) => {
      const q = Number(customQ)
      const r = Number(customR)
      if (Number.isNaN(q) || Number.isNaN(r)) return current

      const next = {
        ...current,
        hexes: current.hexes.filter((hex) => !(hex.q === q && hex.r === r)),
      }

      return normalizeCustomMap(next)
    })
  }

  const selectedZone = useMemo(() => (editMode === 'deploy-blue' ? 'blue' : editMode === 'deploy-red' ? 'red' : null), [editMode])

  const onHexClick = (hex) => {
    const key = `${hex.q},${hex.r}`
    setMapData((current) => {
      const next = {
        ...current,
        terrainMap: { ...current.terrainMap },
        tileMap: { ...(current.tileMap || {}) },
        deploymentZones: {
          blue: [...(current.deploymentZones?.blue || [])],
          red: [...(current.deploymentZones?.red || [])],
        },
      }

      if (editMode === 'terrain') {
        next.terrainMap[key] = selectedTerrain
        if (selectedTile) {
          next.tileMap[key] = selectedTile
        } else {
          delete next.tileMap[key]
        }
      } else if (selectedZone) {
        const myZone = next.deploymentZones[selectedZone]
        const otherZone = next.deploymentZones[selectedZone === 'blue' ? 'red' : 'blue']
        const exists = myZone.some((z) => z.q === hex.q && z.r === hex.r)
        next.deploymentZones[selectedZone] = exists
          ? myZone.filter((z) => !(z.q === hex.q && z.r === hex.r))
          : [...myZone, { q: hex.q, r: hex.r }]
        next.deploymentZones[selectedZone === 'blue' ? 'red' : 'blue'] = otherZone.filter((z) => !(z.q === hex.q && z.r === hex.r))
      }

      return next
    })
  }

  const exportMap = () => {
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(mapData.name || 'custom-map').replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 rounded-xl border border-slate-600 bg-slate-900 p-4 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={mapData.name}
            onChange={(e) => setMapData((curr) => ({ ...curr, name: e.target.value.slice(0, 60) }))}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          />
          <label className="text-xs">W <input type="number" min={3} max={12} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="ml-1 w-14 rounded bg-slate-800 px-1 py-0.5" /></label>
          <label className="text-xs">H <input type="number" min={3} max={10} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="ml-1 w-14 rounded bg-slate-800 px-1 py-0.5" /></label>
          <button onClick={resizeMap} className="rounded bg-slate-700 px-2 py-1 text-xs">Create Size</button>
          <button
            onClick={() => setEditMode('terrain')}
            className={`rounded px-2 py-1 text-xs ${editMode === 'terrain' ? 'bg-amber-600' : 'bg-slate-700'}`}
          >
            Paint Terrain
          </button>
          <button
            onClick={() => setEditMode('deploy-blue')}
            className={`rounded px-2 py-1 text-xs ${editMode === 'deploy-blue' ? 'bg-blue-500' : 'bg-blue-700'}`}
          >
            Blue Deploy
          </button>
          <button
            onClick={() => setEditMode('deploy-red')}
            className={`rounded px-2 py-1 text-xs ${editMode === 'deploy-red' ? 'bg-red-500' : 'bg-red-700'}`}
          >
            Red Deploy
          </button>
          <button
            onClick={() => setEditMode('hex-shape')}
            className={`rounded px-2 py-1 text-xs ${editMode === 'hex-shape' ? 'bg-emerald-500' : 'bg-emerald-700'}`}
          >
            Shape Hexes
          </button>
          <button onClick={exportMap} className="rounded bg-emerald-700 px-2 py-1 text-xs">Export JSON</button>
          <button onClick={() => onApply(mapData)} className="rounded bg-amber-600 px-2 py-1 text-xs">Use In Lobby</button>
          <button onClick={onClose} className="ml-auto rounded bg-slate-700 px-2 py-1 text-xs">Close</button>
        </div>

        <div className="grid flex-1 gap-3 lg:grid-cols-[260px_1fr]">
          <div className="overflow-auto rounded border border-slate-700 p-2">
            <div className="mb-2 rounded border border-slate-700 bg-slate-800/70 p-2 text-xs text-slate-300">
              {editMode === 'terrain'
                ? 'Paint Terrain: choose a terrain + texture, then click hexes to paint them.'
                : editMode === 'hex-shape'
                  ? 'Shape Mode: add or remove any hex by coordinate. Use this to extend specific rows or columns one tile at a time.'
                  : `Deployment Mode: click hexes to toggle the ${selectedZone} deployment area.`}
            </div>
            {editMode === 'hex-shape' && (
              <div className="mb-3 rounded border border-slate-700 bg-slate-800/70 p-2 text-xs">
                <div className="mb-2 text-slate-300">Hex coordinates (axial q,r)</div>
                <div className="mb-2 flex gap-2">
                  <label className="flex items-center gap-1">
                    q
                    <input
                      type="number"
                      value={customQ}
                      onChange={(e) => setCustomQ(Number(e.target.value))}
                      className="w-16 rounded bg-slate-700 px-1 py-0.5"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    r
                    <input
                      type="number"
                      value={customR}
                      onChange={(e) => setCustomR(Number(e.target.value))}
                      className="w-16 rounded bg-slate-700 px-1 py-0.5"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={addHexAtCoordinates} className="rounded bg-emerald-700 px-2 py-1">Add Hex</button>
                  <button onClick={removeHexAtCoordinates} className="rounded bg-rose-700 px-2 py-1">Remove Hex</button>
                </div>
              </div>
            )}
            <div className="mb-2 text-xs text-slate-400">Terrain</div>
            <div className="mb-3 flex flex-wrap gap-1">
              {TERRAIN_OPTIONS.map((terrain) => (
                <button key={terrain} onClick={() => setSelectedTerrain(terrain)} className={`rounded px-2 py-1 text-xs ${selectedTerrain === terrain ? 'bg-amber-600' : 'bg-slate-700'}`}>
                  {terrain}
                </button>
              ))}
            </div>
            <div className="mb-2 text-xs text-slate-400">
              Textures for {selectedTerrain} from /public/tiles
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filteredTiles.map((tile) => (
                <button key={tile} onClick={() => setSelectedTile(tile)} className={`rounded border p-1 ${selectedTile === tile ? 'border-amber-400' : 'border-slate-700'}`}>
                  <img src={tile} alt={tile} className="h-12 w-full object-cover" />
                </button>
              ))}
            </div>
            {filteredTiles.length === 0 && (
              <div className="mt-2 rounded border border-slate-700 bg-slate-800/70 p-2 text-xs text-slate-400">
                No textures found for {selectedTerrain}. Add matching files in /public/tiles.
              </div>
            )}
          </div>
          <div className="relative overflow-hidden rounded border border-slate-700">
            <GameBoard
              onHexClick={onHexClick}
              units={[]}
              hexes={mapData.hexes}
              mapSize={mapData.size}
              terrainMap={mapData.terrainMap}
              tileMap={mapData.tileMap}
              showSpawnZones={false}
              highlightedHexes={selectedZone ? mapData.deploymentZones[selectedZone] : []}
              attackableHexes={[]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
