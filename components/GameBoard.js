'use client'

import React, { useMemo, useCallback } from 'react'
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
  
  // Generate the hex map data
  const hexData = useMemo(() => {
    return generateHexMap(MAP_WIDTH, MAP_HEIGHT).map(hex => ({
      ...hex,
      terrain: getTerrainType(hex.q, hex.r, terrainMap),
      spawnZone: getSpawnZone(hex.q, hex.r),
    }))
  }, [terrainMap])

  // Handle hex click - directly receive the hex data via closure
  const handleHexClick = useCallback((hex) => {
    if (onHexClick && hex) {
      onHexClick(hex)
    }
  }, [onHexClick])

  // Get hex fill color based on terrain and state
  const getHexFill = (hex) => {
    const terrain = TERRAIN_TYPES[hex.terrain]
    return terrain?.color || '#8B9556'
  }

  // Get hex stroke/border based on state
  const getHexStroke = (hex) => {
    // Selected hex (bright yellow)
    if (selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r) {
      return { stroke: '#FBBF24', strokeWidth: 0.25 }
    }
    
    // Attackable hexes (red glow for enemies in range)
    if (attackableHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      return { stroke: '#EF4444', strokeWidth: 0.2 }
    }
    
    // Highlighted (reachable) hexes (green)
    if (highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)) {
      return { stroke: '#34D399', strokeWidth: 0.15 }
    }
    
    // Spawn zone indicators
    if (hex.spawnZone === 0) {
      return { stroke: '#3B82F6', strokeWidth: 0.2 }
    }
    if (hex.spawnZone === 1) {
      return { stroke: '#EF4444', strokeWidth: 0.2 }
    }
    
    return { stroke: '#1E293B', strokeWidth: 0.06 }
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
                {/* Terrain indicator for special terrain */}
                {hex.terrain === 'MOUNTAIN' && !unit && (
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
                {hex.terrain === 'FOREST' && !unit && (
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
                
                {/* Unit rendering */}
                {unit && (
                  <g style={{ pointerEvents: 'none' }}>
                    {/* Unit background circle */}
                    <circle
                      cx="0"
                      cy="0"
                      r="3"
                      fill={unit.ownerID === '0' ? 
                        (unit.hasAttacked ? '#1E40AF' : '#2563EB') : 
                        (unit.hasAttacked ? '#991B1B' : '#DC2626')
                      }
                      stroke={isUnitSelected ? '#FBBF24' : unit.ownerID === '0' ? '#1D4ED8' : '#B91C1C'}
                      strokeWidth={isUnitSelected ? 0.4 : 0.2}
                      opacity="0.9"
                    />
                    
                    {/* Unit emoji */}
                    <text
                      x="0"
                      y="1"
                      fontSize="3"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {unit.emoji || (unit.type === 'SWORDSMAN' ? '⚔️' : unit.type === 'ARCHER' ? '🏹' : unit.type === 'KNIGHT' ? '🐴' : unit.type === 'MILITIA' ? '🗡️' : unit.type === 'CATAPULT' ? '🏰' : '⚔️')}
                    </text>
                    
                    {/* HP bar */}
                    <g transform="translate(-2.5, 2.5)">
                      {/* Background */}
                      <rect x="0" y="0" width="5" height="0.6" fill="#374151" rx="0.2" />
                      {/* HP fill */}
                      <rect 
                        x="0" 
                        y="0" 
                        width={5 * (unit.currentHP / unit.maxHP)} 
                        height="0.6" 
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
  )
}

export default GameBoard
export { TERRAIN_TYPES, generateHexMap, getTerrainType, getSpawnZone }
