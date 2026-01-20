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
  const [dragThreshold, setDragThreshold] = useState(10) // 10px threshold for better tap detection
  const [lastTouchDistance, setLastTouchDistance] = useState(null) // For pinch zoom
  const [hasDragged, setHasDragged] = useState(false)
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 })
  const [touchStartTime, setTouchStartTime] = useState(0)
  const [touchStartPos, setTouchStartPos] = useState({ x: 0, y: 0 })
  const [isTouch, setIsTouch] = useState(false) // Track if this is a touch interaction
  const dragTimeoutRef = useRef(null)
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
    // Prevent mouse events immediately after touch events
    if (isTouch) return
    
    // Prevent text selection during drag
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setHasDragged(false)
    setDragStart({ x: e.clientX - cameraOffset.x, y: e.clientY - cameraOffset.y })
    setMouseDownPos({ x: e.clientX, y: e.clientY })
    
    // Disable text selection globally during drag
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }, [cameraOffset, isTouch])

  // Handle mouse move for panning
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    
    const deltaX = e.clientX - dragStart.x - cameraOffset.x
    const deltaY = e.clientY - dragStart.y - cameraOffset.y
    
    // Check if we've moved beyond the threshold
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    if (distance > dragThreshold) {
      setHasDragged(true)
      setCameraOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart, dragThreshold])

  // Handle mouse up
  const handleMouseUp = useCallback((e) => {
    // Prevent mouse events immediately after touch events
    if (isTouch) return
    
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsDragging(false)
    
    // Check if mouse moved significantly from down position
    const mouseUpDistance = Math.sqrt(
      Math.pow(e.clientX - mouseDownPos.x, 2) + 
      Math.pow(e.clientY - mouseDownPos.y, 2)
    )
    
    // If we dragged, prevent clicks for a short time
    if (mouseUpDistance >= dragThreshold) {
      // Clear any existing timeout
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
      }
      
      // Set hasDragged to true immediately
      setHasDragged(true)
      
      // Reset hasDragged after a short delay to prevent accidental clicks
      dragTimeoutRef.current = setTimeout(() => {
        setHasDragged(false)
        dragTimeoutRef.current = null
      }, 200) // 200ms delay
    } else {
      // This was a click, not a drag
      setHasDragged(false)
    }
    
    // Re-enable text selection
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
  }, [isDragging, mouseDownPos, dragThreshold, isTouch])

  // Cleanup text selection on unmount
  useEffect(() => {
    return () => {
      // Re-enable text selection when component unmounts
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      
      // Clear any pending timeout
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
      }
    }
  }, [])

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e) => {
    console.log('Touch start:', e.touches.length)
    setIsTouch(true) // Mark this as a touch interaction
    
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const currentTime = Date.now()
      
      // Record touch start info for tap detection
      setTouchStartTime(currentTime)
      setTouchStartPos({ x: touch.clientX, y: touch.clientY })
      setHasDragged(false)
      
      // Don't immediately set dragging - wait to see if it's a tap or drag
      setDragStart({ x: touch.clientX - cameraOffset.x, y: touch.clientY - cameraOffset.y })
      setLastTouchDistance(null)
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      setIsDragging(false)
      setLastTouchDistance(null)
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      setLastTouchDistance(distance)
    }
  }, [cameraOffset])

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const currentTime = Date.now()
      const timeDiff = currentTime - touchStartTime
      const moveDistance = Math.sqrt(
        Math.pow(touch.clientX - touchStartPos.x, 2) + 
        Math.pow(touch.clientY - touchStartPos.y, 2)
      )
      
      // If moved beyond threshold or enough time passed, consider it dragging
      if (moveDistance > dragThreshold || timeDiff > 150) {
        if (!isDragging) {
          console.log('Starting drag - distance:', moveDistance, 'time:', timeDiff)
          setIsDragging(true)
          setHasDragged(true)
        }
        
        // Continue panning
        setCameraOffset({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y
        })
      }
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      // Two touches - pinch zoom
      e.preventDefault()
      
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      
      const scale = currentDistance / lastTouchDistance
      if (scale > 0.8 && scale < 1.2) {
        setZoom(prevZoom => Math.max(0.5, Math.min(3, prevZoom * scale)))
      }
      
      setLastTouchDistance(currentDistance)
    }
  }, [isDragging, dragStart, lastTouchDistance, touchStartTime, touchStartPos, dragThreshold])

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
    console.log('Hex clicked:', hex, 'hasDragged:', hasDragged)
    // Prevent hex clicks if we were dragging
    if (hasDragged) {
      console.log('Hex click prevented due to dragging')
      return
    }
    if (onHexClick && hex) {
      console.log('Calling onHexClick with hex:', hex)
      onHexClick(hex)
    }
  }, [onHexClick, hasDragged])

  const handleTouchEnd = useCallback((e) => {
    console.log('Touch end, hasDragged:', hasDragged, 'isDragging:', isDragging)
    
    // If we didn't drag and it was a quick touch, treat it as a tap
    if (!hasDragged && !isDragging) {
      const touchEndTime = Date.now()
      const touchDuration = touchEndTime - touchStartTime
      
      // Only treat as tap if it was quick (less than 500ms)
      if (touchDuration < 500 && touchStartTime > 0) {
        console.log('Detected tap, duration:', touchDuration)
        
        // Find the element under the touch and trigger click
        if (e.changedTouches.length > 0) {
          const touch = e.changedTouches[0]
          const element = document.elementFromPoint(touch.clientX, touch.clientY)
          
          // Find the closest hex element
          const hexElement = element?.closest('[data-hex-q]')
          if (hexElement) {
            const q = parseInt(hexElement.getAttribute('data-hex-q'))
            const r = parseInt(hexElement.getAttribute('data-hex-r'))
            const hex = { q, r, s: -q - r }
            
            console.log('Tap on hex:', hex)
            
            // Find the hex data and trigger click
            const hexDataFound = hexData.find(h => h.q === q && h.r === r)
            if (hexDataFound && onHexClick) {
              handleHexClick(hexDataFound)
            }
          }
        }
      }
    }
    
    // Reset touch state
    setIsDragging(false)
    setHasDragged(false)
    setTouchStartTime(0)
    setLastTouchDistance(null)
    
    // Reset touch flag after a short delay to prevent mouse events
    setTimeout(() => setIsTouch(false), 100)
  }, [hasDragged, isDragging, touchStartTime, hexData, onHexClick, handleHexClick])

  // Get hex fill color (fallback) - removed to show only tiles
  const getHexFill = (hex) => {
    return 'transparent' // No background fill, only tiles
  }

  // Get tile image based on terrain type
  const getTileImage = (hex) => {
    switch(hex.terrain) {
      case 'PLAIN':
        return '/tiles/Grass_5.png'
      case 'FOREST':
        // Use Forest texture (combining forest_3 and forest_4 variants)
        const forestVariants = ['/tiles/Forest.png']
        const seed = Math.abs(hex.q + hex.r * 7)
        return forestVariants[seed % forestVariants.length]
      case 'MOUNTAIN':
        return '/tiles/Mountain_3.png'
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
      className="w-screen h-screen flex items-center justify-center overflow-hidden relative select-none"
      style={{ 
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'manipulation', // Allow taps but disable double-tap zoom and other gestures
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
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        <HexGrid width="100%" height="100%" viewBox="-80 -40 160 120">
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
                <g key={`${hex.q}-${hex.r}-${hex.s}`} data-hex-q={hex.q} data-hex-r={hex.r}>
                  <Hexagon
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
                      {/* Unit Image */}
                      <image
                        href={`/units/${unit.image || 'swordsman'}_${unit.ownerID === '0' ? 'blue' : 'red'}.png`}
                        x="-5"
                        y="-7"
                        width="10"
                        height="14"
                        style={{ 
                          pointerEvents: 'none',
                          filter: isUnitSelected ? 'drop-shadow(0 0 3px #FBBF24)' : 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))'
                        }}
                      />
                      
                      {/* Selection indicator */}
                      {isUnitSelected && (
                        <circle
                          cx="0"
                          cy="0"
                          r="6"
                          fill="none"
                          stroke="#FBBF24"
                          strokeWidth="0.4"
                          opacity="0.8"
                        />
                      )}
                      
                      {/* HP bar */}
                      <g transform="translate(-5, 5)">
                        <rect x="0" y="0" width="10" height="1" fill="#374151" rx="0.2" />
                        <rect 
                          x="0" 
                          y="0" 
                          width={10 * (unit.currentHP / unit.maxHP)} 
                          height="1" 
                          fill={unit.currentHP / unit.maxHP > 0.5 ? '#22C55E' : unit.currentHP / unit.maxHP > 0.25 ? '#EAB308' : '#EF4444'} 
                          rx="0.2" 
                        />
                      </g>
                    </g>
                  )}
                </Hexagon>
                </g>
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
