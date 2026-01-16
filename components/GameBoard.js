'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { HexGrid, Layout, Hexagon, Text, Pattern, Path } from 'react-hexgrid'

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
const getTerrainType = (q, r, s) => {
  // Mountains in center area (strategic barrier)
  const mountainPositions = [
    { q: 0, r: -2 }, { q: 0, r: -1 }, { q: 1, r: -2 },
    { q: -1, r: 0 }, { q: 0, r: 0 },
  ]
  if (mountainPositions.some(pos => pos.q === q && pos.r === r)) {
    return 'MOUNTAIN'
  }
  
  // Forest clusters for strategic cover
  const forestPositions = [
    // Left forest cluster
    { q: -4, r: 0 }, { q: -4, r: 1 }, { q: -3, r: 0 }, { q: -5, r: 2 },
    // Right forest cluster  
    { q: 3, r: -1 }, { q: 4, r: -2 }, { q: 4, r: -1 }, { q: 3, r: 0 },
    // Bottom forest
    { q: -1, r: 3 }, { q: 0, r: 3 }, { q: 1, r: 2 },
    // Top forest
    { q: -1, r: -3 }, { q: 0, r: -4 }, { q: 1, r: -4 },
  ]
  
  if (forestPositions.some(pos => pos.q === q && pos.r === r)) {
    return 'FOREST'
  }
  
  return 'PLAIN'
}

// Determine spawn zone based on q coordinate
const getSpawnZone = (q, r) => {
  // Adjust for offset coordinates
  const effectiveQ = q + Math.floor(r / 2)
  if (effectiveQ <= -4) return 0 // Player 0 (Left/Blue)
  if (effectiveQ >= 4) return 1  // Player 1 (Right/Red)
  return null // No spawn zone
}

const GameBoard = ({ onHexClick, selectedHex, highlightedHexes = [], units = [] }) => {
  const MAP_WIDTH = 6
  const MAP_HEIGHT = 4
  
  // Generate the hex map data
  const hexData = useMemo(() => {
    return generateHexMap(MAP_WIDTH, MAP_HEIGHT).map(hex => ({
      ...hex,
      terrain: getTerrainType(hex.q, hex.r, hex.s),
      spawnZone: getSpawnZone(hex.q, hex.r),
    }))
  }, [])

  // Handle hex click
  const handleHexClick = useCallback((hex) => {
    if (onHexClick) {
      onHexClick(hex)
    }
  }, [onHexClick])

  // Get hex fill color based on terrain and state
  const getHexFill = (hex) => {
    const terrain = TERRAIN_TYPES[hex.terrain]
    return terrain.color
  }

  // Get hex stroke/border based on state
  const getHexStroke = (hex) => {
    const key = `${hex.q},${hex.r},${hex.s}`
    
    // Selected hex
    if (selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r) {
      return { stroke: '#FBBF24', strokeWidth: 0.15 } // Yellow for selected
    }
    
    // Highlighted (reachable) hexes
    if (highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      return { stroke: '#34D399', strokeWidth: 0.12 } // Green for reachable
    }
    
    // Spawn zone indicators
    if (hex.spawnZone === 0) {
      return { stroke: '#3B82F6', strokeWidth: 0.08 } // Blue spawn
    }
    if (hex.spawnZone === 1) {
      return { stroke: '#EF4444', strokeWidth: 0.08 } // Red spawn
    }
    
    return { stroke: '#1E293B', strokeWidth: 0.05 }
  }

  // Get unit on hex if any
  const getUnitOnHex = (hex) => {
    return units.find(u => u.q === hex.q && u.r === hex.r)
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <HexGrid width={900} height={650} viewBox="-55 -40 110 80">
        <Layout size={{ x: 4.5, y: 4.5 }} flat={false} spacing={1.05} origin={{ x: 0, y: 0 }}>
          {hexData.map((hex) => {
            const strokeStyle = getHexStroke(hex)
            const unit = getUnitOnHex(hex)
            const isSelected = selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r
            const isHighlighted = highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)
            
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
                }}
              >
                {/* Terrain indicator for special terrain */}
                {hex.terrain === 'MOUNTAIN' && (
                  <text
                    x="0"
                    y="1"
                    fontSize="4"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    ⛰
                  </text>
                )}
                {hex.terrain === 'FOREST' && (
                  <text
                    x="0"
                    y="1"
                    fontSize="3.5"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    🌲
                  </text>
                )}
              </Hexagon>
            )
          })}
        </Layout>
      </HexGrid>
    </div>
  )
}

export default GameBoard
export { TERRAIN_TYPES, generateHexMap, getTerrainType, getSpawnZone }
