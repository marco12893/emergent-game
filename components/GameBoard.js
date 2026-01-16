'use client'

import React, { useState, useMemo } from 'react'
import { HexGrid, Layout, Hexagon, Text, Pattern, Path } from 'react-hexgrid'

// Terrain types with their properties
const TERRAIN_TYPES = {
  PLAIN: { name: 'Plain', color: '#8B9556', defenseBonus: 0 },
  FOREST: { name: 'Forest', color: '#2D5A27', defenseBonus: 2 },
  MOUNTAIN: { name: 'Mountain', color: '#6B7280', impassable: true },
}

// Generate hex coordinates for a hex-shaped map
const generateHexMap = (radius) => {
  const hexes = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r, s: -q - r })
    }
  }
  return hexes
}

// Determine terrain type based on position (some randomization + logic)
const getTerrainType = (q, r, s) => {
  // Mountains in center-top area
  if (Math.abs(r) <= 1 && q >= -1 && q <= 1 && r < 0) {
    return 'MOUNTAIN'
  }
  
  // Forest clusters
  const forestPositions = [
    // Left forest cluster
    { q: -4, r: 1 }, { q: -4, r: 2 }, { q: -3, r: 1 },
    // Right forest cluster  
    { q: 3, r: -1 }, { q: 4, r: -2 }, { q: 4, r: -1 },
    // Center-bottom forest
    { q: 0, r: 3 }, { q: 1, r: 2 }, { q: -1, r: 3 },
  ]
  
  if (forestPositions.some(pos => pos.q === q && pos.r === r)) {
    return 'FOREST'
  }
  
  return 'PLAIN'
}

// Determine spawn zone
const getSpawnZone = (q, radius) => {
  if (q <= -radius + 2) return 0 // Player 0 (Left/Blue)
  if (q >= radius - 2) return 1  // Player 1 (Right/Red)
  return null // No spawn zone
}

const GameBoard = ({ onHexClick, selectedHex, highlightedHexes = [], units = [] }) => {
  const MAP_RADIUS = 6
  
  // Generate the hex map data
  const hexData = useMemo(() => {
    return generateHexMap(MAP_RADIUS).map(hex => ({
      ...hex,
      terrain: getTerrainType(hex.q, hex.r, hex.s),
      spawnZone: getSpawnZone(hex.q, MAP_RADIUS),
    }))
  }, [])

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
      <HexGrid width={900} height={700} viewBox="-50 -50 100 100">
        <Layout size={{ x: 5, y: 5 }} flat={true} spacing={1.02} origin={{ x: 0, y: 0 }}>
          {hexData.map((hex) => {
            const strokeStyle = getHexStroke(hex)
            const unit = getUnitOnHex(hex)
            
            return (
              <Hexagon
                key={`${hex.q}-${hex.r}-${hex.s}`}
                q={hex.q}
                r={hex.r}
                s={hex.s}
                fill={getHexFill(hex)}
                style={{
                  fill: getHexFill(hex),
                  ...strokeStyle,
                  cursor: 'pointer',
                }}
                onClick={() => onHexClick && onHexClick(hex)}
                className="transition-all duration-150 hover:brightness-110"
              >
                {/* Terrain indicator for special terrain */}
                {hex.terrain === 'MOUNTAIN' && (
                  <text
                    x="0"
                    y="0.5"
                    fontSize="3"
                    textAnchor="middle"
                    fill="#374151"
                  >
                    ⛰️
                  </text>
                )}
                {hex.terrain === 'FOREST' && (
                  <text
                    x="0"
                    y="0.5"
                    fontSize="3"
                    textAnchor="middle"
                    fill="#166534"
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
