'use client'

import React, { useState, useEffect } from 'react'
import { Client } from 'boardgame.io/react'
import { Local, SocketIO } from 'boardgame.io/multiplayer'
import { MedievalBattleGame, UNIT_TYPES, getReachableHexes, getAttackableHexes, hexDistance } from '@/game/GameLogic'
import GameBoard from '@/components/GameBoard'

// Unit Info Panel Component
const UnitInfoPanel = ({ unit, isSelected }) => {
  if (!unit) return null
  
  const hpPercent = (unit.currentHP / unit.maxHP) * 100
  const hpColor = hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'
  
  return (
    <div className={`p-3 rounded-lg border ${isSelected ? 'border-yellow-400 bg-slate-700/80' : 'border-slate-600 bg-slate-800/60'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{unit.emoji}</span>
        <div>
          <div className="font-semibold text-white">{unit.name}</div>
          <div className={`text-xs ${unit.ownerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
            Player {unit.ownerID}
          </div>
        </div>
      </div>
      
      {/* HP Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>HP</span>
          <span>{unit.currentHP}/{unit.maxHP}</span>
        </div>
        <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
          <div 
            className={`h-full ${hpColor} transition-all duration-300`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-red-400">⚔️ {unit.attackPower}</div>
          <div className="text-slate-500">ATK</div>
        </div>
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-blue-400">👟 {unit.movePoints}</div>
          <div className="text-slate-500">MOV</div>
        </div>
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-purple-400">🎯 {unit.range}</div>
          <div className="text-slate-500">RNG</div>
        </div>
      </div>
      
      {/* Action Status */}
      {(unit.hasMoved || unit.hasAttacked) && (
        <div className="mt-2 text-xs text-slate-400">
          {unit.hasMoved && <span className="mr-2">✓ Moved</span>}
          {unit.hasAttacked && <span>✓ Attacked</span>}
        </div>
      )}
    </div>
  )
}

// Game Board Component that connects to boardgame.io
const BattleBoard = ({ ctx, G, moves, playerID, isActive }) => {
  const [selectedHex, setSelectedHex] = useState(null)
  const [highlightedHexes, setHighlightedHexes] = useState([])
  const [attackableHexes, setAttackableHexes] = useState([])
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')
  
  const currentPlayer = ctx.currentPlayer
  const phase = ctx.phase
  const isMyTurn = playerID === currentPlayer
  
  // Get selected unit
  const selectedUnit = G.selectedUnitId 
    ? G.units.find(u => u.id === G.selectedUnitId)
    : null
  
  // Update highlighted hexes when unit is selected
  useEffect(() => {
    if (selectedUnit && phase === 'battle' && !selectedUnit.hasMoved) {
      const reachable = getReachableHexes(selectedUnit, G.hexes, G.units, G.terrainMap)
      setHighlightedHexes(reachable)
      
      const attackable = getAttackableHexes(selectedUnit, G.hexes, G.units)
      setAttackableHexes(attackable)
    } else {
      setHighlightedHexes([])
      setAttackableHexes([])
    }
  }, [selectedUnit, G.hexes, G.units, G.terrainMap, phase])
  
  // Handle hex click
  const handleHexClick = (hex) => {
    setSelectedHex(hex)
    
    if (!isActive) return
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup') {
      // Check if clicking on own unit to remove it
      const unitOnHex = G.units.find(u => u.q === hex.q && u.r === hex.r && u.ownerID === playerID)
      if (unitOnHex) {
        // Remove the unit
        moves.removeUnit(unitOnHex.id)
        return
      }
      
      // Otherwise, try to place a unit
    const mapWidth = G.mapSize?.width || 6
    const leftSpawnMax = -mapWidth + 1
    const rightSpawnMin = mapWidth - 1
    const isSpawnZone = playerID === '0' ? hex.q <= leftSpawnMax : hex.q >= rightSpawnMin
      if (isSpawnZone && hex.terrain !== 'MOUNTAIN') {
        // Check if hex is occupied
        const occupied = G.units.some(u => u.q === hex.q && u.r === hex.r)
        if (!occupied) {
          moves.placeUnit(selectedUnitType, hex.q, hex.r)
        }
      }
      return
    }
    
    // Battle Phase
    if (phase === 'battle') {
      // Check if clicking on own unit to select
      const unitOnHex = G.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      
      if (unitOnHex && unitOnHex.ownerID === playerID) {
        // Select this unit
        moves.selectUnit(unitOnHex.id)
        return
      }
      
      // If we have a selected unit
      if (selectedUnit) {
        // Check if clicking on enemy to attack
        if (unitOnHex && unitOnHex.ownerID !== playerID) {
          const distance = hexDistance(selectedUnit, unitOnHex)
          if (distance <= selectedUnit.range && !selectedUnit.hasAttacked) {
            moves.attackUnit(selectedUnit.id, unitOnHex.id)
            return
          }
        }
        
        // Check if clicking on reachable hex to move
        const isReachable = highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)
        if (isReachable && !selectedUnit.hasMoved) {
          moves.moveUnit(selectedUnit.id, hex.q, hex.r)
          return
        }
        
        // Deselect
        moves.deselectUnit()
      }
    }
  }
  
  // Get units for current player display
  const myUnits = G.units.filter(u => u.ownerID === playerID && u.currentHP > 0)
  const enemyUnits = G.units.filter(u => u.ownerID !== playerID && u.currentHP > 0)
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-400">
            ⚔️ Medieval Tactical Battle Simulator
          </h1>
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
              You: Player {playerID}
            </div>
            <div className="text-sm text-slate-400">
              Phase: {phase?.toUpperCase() || 'SETUP'}
            </div>
          </div>
        </div>
      </header>

      {/* Turn Banner */}
      <div className={`py-2 text-center font-bold text-lg ${
        isMyTurn ? 'bg-green-600/80' : 'bg-slate-700/80'
      }`}>
        {isMyTurn ? "🎯 YOUR TURN!" : `⏳ Waiting for Player ${currentPlayer}...`}
      </div>

      {/* Main Game Area */}
      <div className="flex flex-1 max-w-7xl mx-auto p-4 gap-4" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Left Sidebar - Unit Selection (Setup) / My Units (Battle) */}
        <div className="w-64 flex flex-col gap-4">
          {phase === 'setup' ? (
            <>
              <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                <h2 className="text-lg font-semibold text-amber-400 mb-3">🎖️ Place Units</h2>
                <p className="text-xs text-slate-400 mb-2">
                  {isMyTurn ? (
                    <>
                      <span className="text-green-400 font-semibold">Your turn!</span> Select a unit type, then click on your spawn zone (
                      <span className={playerID === '0' ? 'text-blue-400' : 'text-red-400'}>
                        {playerID === '0' ? 'Blue' : 'Red'}
                      </span> border) to place.
                    </>
                  ) : (
                    <span className="text-yellow-400">⏳ Waiting for Player {currentPlayer}'s turn...</span>
                  )}
                </p>
                <p className="text-xs text-green-400 mb-3">
                  💡 Click placed units to remove • Click "End Turn" to pass
                </p>
                
                <div className="space-y-2">
                  {Object.values(UNIT_TYPES).map(unit => (
                    <button
                      key={unit.type}
                      onClick={() => setSelectedUnitType(unit.type)}
                      className={`w-full p-2 rounded border text-left transition-all ${
                        selectedUnitType === unit.type 
                          ? 'border-amber-400 bg-amber-400/20' 
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{unit.emoji}</span>
                        <div>
                          <div className="font-medium text-sm">{unit.name}</div>
                          <div className="text-xs text-slate-400">
                            HP:{unit.maxHP} ATK:{unit.attackPower} MOV:{unit.movePoints}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                
                <div className="mt-4 text-sm text-slate-400">
                  Units placed: {myUnits.length}/5
                </div>
              </div>
              
              {/* Show Placed Units */}
              {myUnits.length > 0 && (
                <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                  <h2 className="text-lg font-semibold text-blue-400 mb-3">📋 Your Units</h2>
                  <div className="space-y-2">
                    {myUnits.map(unit => (
                      <div key={unit.id} className="flex items-center gap-2 text-sm bg-slate-700/50 p-2 rounded border border-slate-600 hover:border-yellow-400 cursor-pointer transition-all" title="Click on map to remove">
                        <span className="text-xl">{unit.emoji}</span>
                        <div className="flex-1">
                          <div className="font-medium text-white">{unit.name}</div>
                          <div className="text-xs text-slate-400">({unit.q}, {unit.r})</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 italic">
                    Click units on map to remove
                  </div>
                </div>
              )}
              
              {/* Ready Button */}
              <button
                onClick={() => moves.readyForBattle()}
                disabled={myUnits.length === 0 || G.playersReady[playerID]}
                className={`w-full py-3 rounded-lg font-bold transition-all ${
                  G.playersReady[playerID]
                    ? 'bg-green-600 cursor-not-allowed'
                    : myUnits.length === 0
                    ? 'bg-slate-600 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400'
                }`}
              >
                {G.playersReady[playerID] ? '✓ Ready!' : '🚀 Ready for Battle'}
              </button>
              
              {/* End Turn Button for Setup Phase */}
              {isMyTurn && (
                <button
                  onClick={() => {
                    console.log('End Turn clicked!');
                    console.log('moves:', moves);
                    console.log('moves.endTurn:', moves.endTurn);
                    console.log('currentPlayer:', ctx.currentPlayer);
                    console.log('playerID:', playerID);
                    console.log('isMyTurn:', isMyTurn);
                    
                    if (moves.endTurn) {
                      console.log('Calling moves.endTurn()');
                      moves.endTurn();
                    } else {
                      console.log('moves.endTurn is not available!');
                    }
                  }}
                  className="w-full py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-500 transition-all text-sm"
                >
                  ⏭️ End Turn (Pass to Other Player)
                </button>
              )}
              
              {/* Hotseat Mode Notice */}
              {G.playersReady[playerID] && !G.playersReady[playerID === '0' ? '1' : '0'] && (
                <div className="bg-blue-500/20 border border-blue-400 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-blue-300 mb-1">⚠️ Hotseat Mode</div>
                  <div className="text-blue-200">
                    Switch to <span className="font-bold">{playerID === '0' ? 'Player 1 (Red)' : 'Player 0 (Blue)'}</span> using the top-right toggle. 
                    Both players must click Ready to start battle!
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                <h2 className="text-lg font-semibold text-amber-400 mb-3">🛡️ Your Army</h2>
                <div className="space-y-2">
                  {myUnits.map(unit => (
                    <UnitInfoPanel 
                      key={unit.id} 
                      unit={unit} 
                      isSelected={G.selectedUnitId === unit.id}
                    />
                  ))}
                  {myUnits.length === 0 && (
                    <div className="text-slate-500 text-sm">No units remaining</div>
                  )}
                </div>
              </div>
              
              {/* End Turn Button */}
              {isMyTurn && (
                <button
                  onClick={() => moves.endTurn()}
                  className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 transition-all"
                >
                  ✓ End Turn
                </button>
              )}
            </>
          )}
        </div>

        {/* Game Board */}
        <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
          <GameBoard 
            onHexClick={handleHexClick}
            selectedHex={selectedHex}
            highlightedHexes={highlightedHexes}
            attackableHexes={attackableHexes}
            units={G.units.filter(u => u.currentHP > 0)}
            hexes={G.hexes || []}
            mapSize={G.mapSize || null}
            terrainMap={G.terrainMap}
            selectedUnitId={G.selectedUnitId}
            currentPlayerID={playerID}
            showSpawnZones={G.phase === 'setup'}
          />
        </div>

        {/* Right Sidebar - Selected Hex Info & Game Log */}
        <div className="w-72 flex flex-col gap-4">
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
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Click a hex to see details</p>
            )}
          </div>
          
          {/* Enemy Units */}
          {phase === 'battle' && (
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h2 className="text-lg font-semibold text-red-400 mb-3">👹 Enemy Army</h2>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {enemyUnits.map(unit => (
                  <div key={unit.id} className="flex items-center gap-2 text-sm bg-slate-700/50 p-2 rounded">
                    <span>{unit.emoji}</span>
                    <span>{unit.name}</span>
                    <span className="ml-auto text-red-400">{unit.currentHP}/{unit.maxHP}</span>
                  </div>
                ))}
                {enemyUnits.length === 0 && (
                  <div className="text-green-400 text-sm">🎉 All enemies defeated!</div>
                )}
              </div>
            </div>
          )}

          {/* Game Log */}
          <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">📜 Battle Log</h2>
            <div className="flex-1 overflow-y-auto space-y-1">
              {[...G.log].reverse().slice(0, 15).map((log, index) => (
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

// Create the boardgame.io client
const MedievalBattleClient = Client({
  game: MedievalBattleGame,
  board: BattleBoard,
  multiplayer: Local(),
  debug: false,
})

// Main App with two player views (hotseat)
export default function Home() {
  const [activePlayer, setActivePlayer] = useState('0')
  
  return (
    <div className="relative">
      {/* Player Toggle */}
      <div className="fixed top-4 right-4 z-50 bg-slate-800 rounded-lg p-2 border border-slate-600 shadow-xl">
        <div className="text-xs text-slate-400 mb-2">Hotseat Mode - Switch Player:</div>
        <div className="flex gap-2">
          <button
            onClick={() => setActivePlayer('0')}
            className={`px-4 py-2 rounded font-bold transition-all ${
              activePlayer === '0' 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            Player 0 (Blue)
          </button>
          <button
            onClick={() => setActivePlayer('1')}
            className={`px-4 py-2 rounded font-bold transition-all ${
              activePlayer === '1' 
                ? 'bg-red-600 text-white' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            Player 1 (Red)
          </button>
        </div>
      </div>
      
      {/* Game Client */}
      <MedievalBattleClient playerID={activePlayer} />
    </div>
  )
}
