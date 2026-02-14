'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import GameBoard from '@/components/GameBoard'
import { parseImportedCustomMap } from '@/lib/customMap'

const TERRAIN_OPTIONS = ['PLAIN', 'FOREST', 'MOUNTAIN', 'HILLS', 'WATER', 'CITY']

const getTileTerrainType = (tilePath = '') => {
  const value = tilePath.toLowerCase()
  if (value.includes('forest')) return 'FOREST'
  if (value.includes('mountain')) return 'MOUNTAIN'
  if (value.includes('hill')) return 'HILLS'
  if (value.includes('ocean') || value.includes('water')) return 'WATER'
  if (value.includes('city')) return 'CITY'
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
  const importInputRef = useRef(null)
  const customImageInputRef = useRef(null)
  const editorViewportRef = useRef(null)
  const [customImageEditor, setCustomImageEditor] = useState(null)
  const [editorOffset, setEditorOffset] = useState({ x: 0, y: 0 })
  const [editorHexRadius, setEditorHexRadius] = useState(100)
  const [isSavingCustomTile, setIsSavingCustomTile] = useState(false)
  const [customTileStatus, setCustomTileStatus] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [editorViewportSize, setEditorViewportSize] = useState({ width: 420, height: 420 })
  const panStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  const buildHexPath = (ctx, centerX, centerY, radius) => {
    ctx.beginPath()
    for (let i = 0; i < 6; i += 1) {
      const angle = ((60 * i - 90) * Math.PI) / 180
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }


  const getOverlayHexPoints = () => {
    const centerX = editorViewportSize.width / 2
    const centerY = editorViewportSize.height / 2

    return Array.from({ length: 6 })
      .map((_, i) => {
        const angle = ((60 * i - 90) * Math.PI) / 180
        const x = centerX + Math.cos(angle) * editorHexRadius
        const y = centerY + Math.sin(angle) * editorHexRadius
        return `${x},${y}`
      })
      .join(' ')
  }

  const reloadTiles = async () => {
    try {
      const res = await fetch(`/api/tiles?ts=${Date.now()}`, { cache: 'no-store' })
      const data = await res.json()
      const list = data?.tiles || []
      setTiles(list)
      return list
    } catch {
      setTiles([])
      return []
    }
  }

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
    reloadTiles().then((list) => {
      if (!list.length) {
        setSelectedTile('')
        return
      }

      const matching = list.find((tile) => getTileTerrainType(tile) === selectedTerrain)
      setSelectedTile(matching || list[0])
    })
  }, [open, selectedTerrain])

  useEffect(() => {
    return () => {
      if (customImageEditor?.src) {
        URL.revokeObjectURL(customImageEditor.src)
      }
    }
  }, [customImageEditor])

  useEffect(() => {
    if (!customImageEditor || !editorViewportRef.current) return

    const element = editorViewportRef.current
    const updateViewportSize = () => {
      setEditorViewportSize({ width: element.clientWidth, height: element.clientHeight })
    }

    updateViewportSize()
    const observer = new ResizeObserver(updateViewportSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [customImageEditor])

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

  const importMap = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const imported = JSON.parse(text)
      const normalizedMap = parseImportedCustomMap(imported)
      if (!normalizedMap) {
        return
      }

      setMapData(normalizeCustomMap(normalizedMap))
      setWidth(normalizedMap.size.width)
      setHeight(normalizedMap.size.height)
    } catch {
      // Keep editor state untouched when import fails.
    } finally {
      event.target.value = ''
    }
  }

  const openCustomImageEditor = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const src = URL.createObjectURL(file)
    const image = new Image()
    image.src = src
    await image.decode()

    if (customImageEditor?.src) {
      URL.revokeObjectURL(customImageEditor.src)
    }

    setCustomImageEditor({ src, name: file.name, width: image.naturalWidth, height: image.naturalHeight })
    setEditorOffset({ x: 0, y: 0 })
    setEditorHexRadius(100)
    event.target.value = ''
  }

  const saveCustomHexTile = async () => {
    if (!customImageEditor || !editorViewportRef.current || isSavingCustomTile) return

    setCustomTileStatus('')

    const image = new Image()
    image.src = customImageEditor.src
    await image.decode()

    const viewportRect = editorViewportRef.current.getBoundingClientRect()
    const baseScale = Math.min(viewportRect.width / image.naturalWidth, viewportRect.height / image.naturalHeight)
    const drawWidth = image.naturalWidth * baseScale
    const drawHeight = image.naturalHeight * baseScale
    const drawX = (viewportRect.width - drawWidth) / 2 + editorOffset.x
    const drawY = (viewportRect.height - drawHeight) / 2 + editorOffset.y

    const outputSize = Math.max(8, Math.round(editorHexRadius * 2))
    const outputCenter = outputSize / 2
    const sourceCenterX = viewportRect.width / 2
    const sourceCenterY = viewportRect.height / 2

    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, outputSize, outputSize)
    buildHexPath(ctx, outputCenter, outputCenter, outputCenter - 2)
    ctx.clip()

    const translatedX = outputCenter - sourceCenterX + drawX
    const translatedY = outputCenter - sourceCenterY + drawY
    ctx.drawImage(image, translatedX, translatedY, drawWidth, drawHeight)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      setCustomTileStatus('Could not generate PNG tile from selection.')
      return
    }

    const timestamp = Date.now()
    const filenameBase = (customImageEditor?.name || 'custom_hex').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const downloadName = `${filenameBase}_hex_${timestamp}.png`

    const downloadUrl = URL.createObjectURL(blob)
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = downloadName
    downloadLink.click()
    URL.revokeObjectURL(downloadUrl)

    const formData = new FormData()
    formData.append('file', blob, downloadName)

    setIsSavingCustomTile(true)
    try {
      const res = await fetch('/api/tiles/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setCustomTileStatus(data?.error || 'Tile downloaded, but upload failed.')
        return
      }

      const list = await reloadTiles()
      if (data?.tilePath && list.includes(data.tilePath)) {
        setSelectedTile(data.tilePath)
      }

      setCustomTileStatus('Tile downloaded and added to texture list.')
      setCustomImageEditor(null)
      setSelectedTerrain('PLAIN')
    } catch {
      setCustomTileStatus('Tile downloaded locally, but upload request failed.')
    } finally {
      setIsSavingCustomTile(false)
    }
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
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={importMap}
            className="hidden"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded bg-sky-700 px-2 py-1 text-xs"
          >
            Import JSON
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
            <input
              ref={customImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={openCustomImageEditor}
              className="hidden"
            />
            <button
              onClick={() => customImageInputRef.current?.click()}
              className="mb-2 w-full rounded bg-violet-700 px-2 py-1 text-xs"
            >
              Add Custom Image Tile
            </button>
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

      {customImageEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-slate-600 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm">Position the transparent hex over your image, then save.</div>
              <button onClick={() => setCustomImageEditor(null)} className="rounded bg-slate-700 px-2 py-1 text-xs">Close</button>
            </div>
            <div
              ref={editorViewportRef}
              className="relative mx-auto h-[420px] w-[420px] max-w-full cursor-grab overflow-hidden rounded border border-slate-700 bg-slate-950"
              onMouseDown={(event) => {
                setIsPanning(true)
                panStartRef.current = { x: event.clientX, y: event.clientY }
                offsetStartRef.current = { ...editorOffset }
              }}
              onMouseMove={(event) => {
                if (!isPanning) return
                const dx = event.clientX - panStartRef.current.x
                const dy = event.clientY - panStartRef.current.y
                setEditorOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
              onWheel={(event) => {
                event.preventDefault()
                setEditorHexRadius((current) => Math.max(8, current - event.deltaY * 0.05))
              }}
            >
              <img
                src={customImageEditor.src}
                alt="Custom tile editor"
                className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 select-none"
                style={{ transform: `translate(calc(-50% + ${editorOffset.x}px), calc(-50% + ${editorOffset.y}px))` }}
              />
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <defs>
                  <mask id="hex-mask-overlay">
                    <rect width="100%" height="100%" fill="white" />
                    <polygon
                      points={getOverlayHexPoints()}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(15,23,42,0.58)" mask="url(#hex-mask-overlay)" />
                <polygon
                  points={getOverlayHexPoints()}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth="0.6"
                />
              </svg>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                Hex size
                <input
                  type="number"
                  min={8}
                  step={5}
                  value={Math.round(editorHexRadius)}
                  onChange={(e) => setEditorHexRadius(Math.max(8, Number(e.target.value) || 8))}
                  className="w-24 rounded bg-slate-800 px-2 py-1"
                />
              </label>
              <div className="text-slate-400">Drag to pan image. Use mouse wheel or number input to resize hex (no max limit).</div>
              {customTileStatus && (
                <div className="max-w-xs text-[11px] text-slate-300">{customTileStatus}</div>
              )}
              <button
                onClick={saveCustomHexTile}
                disabled={isSavingCustomTile}
                className="ml-auto rounded bg-emerald-700 px-3 py-1 disabled:opacity-60"
              >
                {isSavingCustomTile ? 'Saving...' : 'Save & Download Tile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
