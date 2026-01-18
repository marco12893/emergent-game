'use client'

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { HexGrid, Layout, Hexagon } from 'react-hexgrid'

// Terrain types with their properties
const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', color: '#8B9556', defenseBonus: 0 },
  FOREST: { name: 'Forest', color: '#2D5A27', defenseBonus: 2 },
  MOUNTAIN: { name: 'Mountain', color: '#6B7280', impassable: true },
}

// Generate hex coordinates for a rectangular-ish hex map
const generateHexMap = (width, height) => {
  const hexes = []
  for (let r = -height; r <= height; r++) {
    const rOffset = Math.floor(r / 2)
    for (let q = -width - rOffset; q <= width - rOffset; q++) {
      hexes.push({ q, r, s: -q - r })
    }
  }
  return hexes
}

// Determine terrain type based on position
const getTerrainType = (q, r, terrainMap) => {
  if (terrainMap && terrainMap[`${q},${r}`]) {
    return terrainMap[`${q},${r}`]
  }
  return 'PLAIN'
}

// Determine spawn zone based on q coordinate
const getSpawnZone = (q, r) => {
  if (q <= -5) return 0 // Player 0 (Left/Blue)
  if (q >= 4) return 1  // Player 1 (Right/Red)
  return null // No spawn zone
}

const GameBoard = ({ 
  onHexClick, 
  selectedHex, 
  highlightedHexes = [], 
  attackableHexes = [],
  units = [],
  terrainMap = {},
  selectedUnitId = null,
  currentPlayerID = '0'
}) => {
  const MAP_WIDTH = 6
  const MAP_HEIGHT = 4
  const HEX_SIZE = 5.5 
  
  // Camera state
  const [cameraOffset, setCameraOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef(null)

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prevZoom => Math.max(0.5, Math.min(3, prevZoom * delta)))
  }, [])

  // Handle mouse down for panning
  const handleMouseDown = useCallback((e) => {
    // Prevent text selection during drag
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX - cameraOffset.x, y: e.clientY - cameraOffset.y })
    
    // Disable text selection globally during drag
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }, [cameraOffset])

  // Handle mouse move for panning
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    setCameraOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback((e) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsDragging(false)
    
    // Re-enable text selection
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
  }, [isDragging])

  // Cleanup text selection on unmount
  useEffect(() => {
    return () => {
      // Re-enable text selection when component unmounts
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
    }
  }, [])

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      setIsDragging(true)
      setDragStart({ x: touch.clientX - cameraOffset.x, y: touch.clientY - cameraOffset.y })
    }
  }, [cameraOffset])

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || e.touches.length !== 1) return
    const touch = e.touches[0]
    setCameraOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  // Add event listeners
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleMouseMove(e)
    const handleGlobalMouseUp = () => handleMouseUp()
    
    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)
    }
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp]) 

  // Generate the hex map data
  const hexData = useMemo(() => {
    return generateHexMap(MAP_WIDTH, MAP_HEIGHT).map(hex => ({
      ...hex,
      terrain: getTerrainType(hex.q, hex.r, terrainMap),
      spawnZone: getSpawnZone(hex.q, hex.r),
    }))
  }, [terrainMap])

  // Handle hex click
  const handleHexClick = useCallback((hex) => {
    if (onHexClick && hex) {
      onHexClick(hex)
    }
  }, [onHexClick])

  // Get hex fill color (fallback) - removed to show only tiles
  const getHexFill = (hex) => {
    return 'transparent' // No background fill, only tiles
  }

  // Get tile image based on terrain type
  const getTileImage = (hex) => {
    switch(hex.terrain) {
      case 'PLAIN':
        // Only regular grass
        return '/tiles/grass.png'
      case 'FOREST':
        // Only using forest_3 and forest_4 as requested
        const forestVariants = ['/tiles/forest_3.png', '/tiles/forest_4.png']
        const seed = Math.abs(hex.q + hex.r * 7)
        return forestVariants[seed % forestVariants.length]
      case 'MOUNTAIN':
        return '/tiles/mountain.png'
      default:
        return null
    }
  }

  // Get hex stroke/border based on state
  const getHexStroke = (hex) => {
    if (selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r) {
      return { stroke: '#FBBF24', strokeWidth: 0.25 } // Selected (Yellow)
    }
    if (attackableHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      return { stroke: '#EF4444', strokeWidth: 0.2 } // Attackable (Red)
    }
    if (highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      return { stroke: '#34D399', strokeWidth: 0.15 } // Movable (Green)
    }
    if (hex.spawnZone === 0) return { stroke: '#3B82F6', strokeWidth: 0.2 } // P0 Spawn
    if (hex.spawnZone === 1) return { stroke: '#EF4444', strokeWidth: 0.2 } // P1 Spawn
    
    return { stroke: '#1E293B', strokeWidth: 0.06 } // Default Border
  }

  const getUnitOnHex = (hex) => {
    return units.find(u => u.q === hex.q && u.r === hex.r)
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden relative select-none"
      style={{ 
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', // Prevent touch scrolling on mobile
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp} // Handle mouse leaving the container
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Camera controls info */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">
        Zoom: {Math.round(zoom * 100)}% | Drag to pan | Scroll to zoom
      </div>
      
      {/* Reset camera button */}
      <button
        onClick={() => {
          setCameraOffset({ x: 0, y: 0 })
          setZoom(1)
        }}
        className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-10 hover:bg-black/70"
      >
        Reset View
      </button>

      <div 
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        <HexGrid width={900} height={650} viewBox="-70 -20 140 100">
          <defs>
            <clipPath id="hex-clip">
              <polygon points="0,-5.5 4.76,-2.75 4.76,2.75 0,5.5 -4.76,2.75 -4.76,-2.75" />
            </clipPath>
          </defs>

          <Layout size={{ x: HEX_SIZE, y: HEX_SIZE }} flat={false} spacing={1.05} origin={{ x: 0, y: 0 }}>
            {hexData.map((hex) => {
              const strokeStyle = getHexStroke(hex)
              const unit = getUnitOnHex(hex)
              const isUnitSelected = unit && unit.id === selectedUnitId
              const isAttackable = attackableHexes.some(h => h.q === hex.q && h.r === hex.r)
              const isReachable = highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)
              
              return (
                <Hexagon
                  key={`${hex.q}-${hex.r}-${hex.s}`}
                  q={hex.q}
                  r={hex.r}
                  s={hex.s}
                  onClick={() => handleHexClick(hex)}
                  cellStyle={{
                    fill: getHexFill(hex),
                    stroke: strokeStyle.stroke,
                    strokeWidth: strokeStyle.strokeWidth,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    filter: isReachable ? 'brightness(1.3)' : isAttackable ? 'brightness(1.2)' : 'none',
                  }}
                >
                  {/* 1. TERRAIN IMAGE (Layer 0) */}
                  {getTileImage(hex) && (
                    <image
                      href={getTileImage(hex)}
                      x={-HEX_SIZE * 1.2}
                      y={-HEX_SIZE * 1.2}
                      width={HEX_SIZE * 2.4}
                      height={HEX_SIZE * 2.4}
                      clipPath="url(#hex-clip)"
                      preserveAspectRatio="xMidYMid slice"
                      style={{ 
                        pointerEvents: 'none', 
                        opacity: 0.8
                      }}
                    />
                  )}
                  
                  {/* 2. UNIT (Layer 1 - On Top) */}
                  {unit && (
                    <g style={{ pointerEvents: 'none' }}>
                      {/* Background Circle */}
                      <circle
                        cx="0"
                        cy="0"
                        r="4"
                        fill={unit.ownerID === '0' ? 
                          (unit.hasAttacked ? '#1E40AF' : '#2563EB') : 
                          (unit.hasAttacked ? '#991B1B' : '#DC2626')
                        }
                        stroke={isUnitSelected ? '#FBBF24' : unit.ownerID === '0' ? '#1D4ED8' : '#B91C1C'}
                        strokeWidth={isUnitSelected ? 0.4 : 0.2}
                        opacity="0.9"
                      />
                      
                      {/* Unit Emoji (Restored) */}
                      <text
                        x="0"
                        y="1.5"
                        fontSize="4"
                        textAnchor="middle"
                        style={{ pointerEvents: 'none', textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}
                      >
                        {unit.emoji || (unit.type === 'SWORDSMAN' ? '⚔️' : unit.type === 'ARCHER' ? '🏹' : unit.type === 'KNIGHT' ? '🐴' : unit.type === 'MILITIA' ? '🗡️' : unit.type === 'CATAPULT' ? '🏰' : '⚔️')}
                      </text>
                      
                      {/* HP bar */}
                      <g transform="translate(-3, 3)">
                        <rect x="0" y="0" width="6" height="0.8" fill="#374151" rx="0.2" />
                        <rect 
                          x="0" 
                          y="0" 
                          width={6 * (unit.currentHP / unit.maxHP)} 
                          height="0.8" 
                          fill={unit.currentHP / unit.maxHP > 0.5 ? '#22C55E' : unit.currentHP / unit.maxHP > 0.25 ? '#EAB308' : '#EF4444'} 
                          rx="0.2" 
                        />
                      </g>
                    </g>
                  )}
                </Hexagon>
              )
            })}
          </Layout>
        </HexGrid>
      </div>
    </div>
  )
}

export default GameBoard
export { TERRAIN_TYPES, generateHexMap, getTerrainType, getSpawnZone }