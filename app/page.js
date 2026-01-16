'use client'

import React, { useState } from 'react'
import GameBoard from '@/components/GameBoard'

export default function Home() {
  const [selectedHex, setSelectedHex] = useState(null)
  const [gameLog, setGameLog] = useState(['Game initialized. Map ready!'])

  const handleHexClick = (hex) => {
    setSelectedHex(hex)
    
    // Add to game log
    const terrainName = hex.terrain
    const spawnInfo = hex.spawnZone !== null 
      ? ` (Player ${hex.spawnZone} Spawn Zone)` 
      : ''
    
    setGameLog(prev => [
      `Clicked hex (${hex.q}, ${hex.r}): ${terrainName}${spawnInfo}`,
      ...prev.slice(0, 9) // Keep last 10 entries
    ])
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-400">
            ⚔️ Medieval Tactical Battle Simulator
          </h1>
          <div className="text-sm text-slate-400">
            Phase 1: Hex Map Foundation
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <div className="flex flex-1 max-w-7xl mx-auto p-4 gap-4" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Game Board */}
        <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
          <GameBoard 
            onHexClick={handleHexClick}
            selectedHex={selectedHex}
            highlightedHexes={[]}
            units={[]}
          />
        </div>

        {/* Sidebar */}
        <div className="w-80 flex flex-col gap-4">
          {/* Legend */}
          <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">🗺️ Map Legend</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: '#8B9556' }}></div>
                <span>Plain (Default terrain)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: '#2D5A27' }}></div>
                <span>Forest (+2 Defense)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: '#6B7280' }}></div>
                <span>Mountain (Impassable)</span>
              </div>
              <hr className="border-slate-600 my-2" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-blue-500 bg-slate-700"></div>
                <span>Player 0 Spawn Zone (Blue)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-red-500 bg-slate-700"></div>
                <span>Player 1 Spawn Zone (Red)</span>
              </div>
            </div>
          </div>

          {/* Selected Hex Info */}
          <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">📍 Selected Hex</h2>
            {selectedHex ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Coordinates:</span>
                  <span className="font-mono">({selectedHex.q}, {selectedHex.r})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Terrain:</span>
                  <span className={`font-medium ${
                    selectedHex.terrain === 'FOREST' ? 'text-green-400' :
                    selectedHex.terrain === 'MOUNTAIN' ? 'text-gray-400' :
                    'text-yellow-400'
                  }`}>
                    {selectedHex.terrain}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Spawn Zone:</span>
                  <span className={`font-medium ${
                    selectedHex.spawnZone === 0 ? 'text-blue-400' :
                    selectedHex.spawnZone === 1 ? 'text-red-400' :
                    'text-slate-500'
                  }`}>
                    {selectedHex.spawnZone !== null ? `Player ${selectedHex.spawnZone}` : 'None'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Click a hex to see details</p>
            )}
          </div>

          {/* Game Log */}
          <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">📜 Game Log</h2>
            <div className="flex-1 overflow-y-auto space-y-1">
              {gameLog.map((log, index) => (
                <div 
                  key={index} 
                  className={`text-xs p-2 rounded ${
                    index === 0 ? 'bg-slate-700/50 text-white' : 'text-slate-400'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
