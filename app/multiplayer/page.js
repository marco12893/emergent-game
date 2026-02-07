'use client'

import React, { useEffect, useState } from 'react'
import { Client } from 'boardgame.io/react'
import { SocketIO } from 'boardgame.io/multiplayer'
import { MedievalBattleGame, UNIT_TYPES, TERRAIN_TYPES, getReachableHexes, getAttackableHexes, hexDistance } from '@/game/GameLogic'
import GameBoard from '@/components/GameBoard'
import VictoryScreen from '@/components/VictoryScreen'

// Unit Info Panel Component
const UnitInfoPanel = ({ unit, isSelected }) => {
  if (!unit) return null
  
  const hpPercent = (unit.currentHP / unit.maxHP) * 100
  const hpColor = hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'
  
  return (
    <div className={`p-3 rounded-lg border-2 transition-all ${
      isSelected ? 'border-amber-400 bg-amber-400/10' : 'border-slate-600 bg-slate-800/50'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{unit.emoji}</span>
        <div>
          <div className="font-semibold text-white">{unit.name}</div>
          <div className="text-xs text-slate-400">Player {unit.ownerID}</div>
        </div>
      </div>
      
      {/* HP Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>HP</span>
          <span>{unit.currentHP}/{unit.maxHP}</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className={`${hpColor} h-2 rounded-full transition-all`}
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
  const [hoveredHex, setHoveredHex] = useState(null)
  const [damagePreview, setDamagePreview] = useState(null)
  const [showVictoryScreen, setShowVictoryScreen] = useState(true) // Default to true, can be closed
  
  const currentPlayer = ctx.currentPlayer
  const phase = ctx.phase
  const isMyTurn = playerID === currentPlayer
  
  // Get selected unit
  const selectedUnit = G.selectedUnitId 
    ? G.units.find(u => u.id === G.selectedUnitId)
    : null
  
  // Update highlighted hexes when unit is selected
  useEffect(() => {
    if (selectedUnit && phase === 'battle') {
      const reachable = getReachableHexes(selectedUnit, G.hexes, G.units, G.terrainMap)
      setHighlightedHexes(reachable)
      
      const attackable = getAttackableHexes(selectedUnit, G.hexes, G.units)
      setAttackableHexes(attackable)
    } else {
      setHighlightedHexes([])
      setAttackableHexes([])
    }
  }, [selectedUnit, G.hexes, G.units, G.terrainMap, phase])

  useEffect(() => {
    if (
      !selectedUnit ||
      !hoveredHex ||
      phase !== 'battle' ||
      !isMyTurn ||
      selectedUnit.hasAttacked
    ) {
      setDamagePreview(null)
      return
    }

    const targetUnit = G.units.find(
      u => u.q === hoveredHex.q && u.r === hoveredHex.r && u.ownerID !== playerID && u.currentHP > 0
    )

    if (!targetUnit) {
      setDamagePreview(null)
      return
    }

    const distance = hexDistance(selectedUnit, targetUnit)
    if (distance > selectedUnit.range) {
      setDamagePreview(null)
      return
    }

    const targetTerrain = G.terrainMap[`${targetUnit.q},${targetUnit.r}`] || 'PLAIN'
    const defenseBonus = TERRAIN_TYPES[targetTerrain]?.defenseBonus ?? 0
    const attackerTerrain = G.terrainMap[`${selectedUnit.q},${selectedUnit.r}`] || 'PLAIN'
    const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(selectedUnit.type)
      ? 5
      : 0
    const attackDamage = Math.max(1, selectedUnit.attackPower + hillBonus - defenseBonus)
    const targetRemaining = targetUnit.currentHP - attackDamage

    let counterDamage = 0
    if (targetRemaining > 0 && selectedUnit.range === 1 && distance === 1) {
      counterDamage = Math.max(1, Math.floor(targetUnit.attackPower * 0.5))
    }

    setDamagePreview({
      attackerId: selectedUnit.id,
      targetId: targetUnit.id,
      attackDamage,
      counterDamage,
    })
  }, [selectedUnit, hoveredHex, phase, isMyTurn, G.units, G.terrainMap, playerID])

  useEffect(() => {
    if (!G.selectedUnitId) {
      setSelectedHex(null)
      setHoveredHex(null)
      setDamagePreview(null)
    }
  }, [G.selectedUnitId])
  
  // Handle hex click
  const handleHexClick = (hex) => {
    setSelectedHex(hex)
    
    if (!isActive) return
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup' && isMyTurn) {
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

  const handleEndTurn = () => {
    if (!isMyTurn) return
    moves.deselectUnit()
    setSelectedHex(null)
    setHoveredHex(null)
    setDamagePreview(null)
    moves.endTurn()
  }

  const handleUndoMove = () => {
    if (!selectedUnit || selectedUnit.hasAttacked || !selectedUnit.lastMove) return
    moves.undoMove(selectedUnit.id)
    setDamagePreview(null)
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
            ⚔️ Medieval Tactical Battle - Multiplayer
          </h1>
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
              You: Player {playerID}
            </div>
            <div className="text-sm text-slate-400">
              Phase: {phase?.toUpperCase() || 'SETUP'}
            </div>
            {phase === 'battle' && (
              <div className="px-3 py-1 bg-purple-600 rounded text-sm font-semibold">
                🔄 Turn {G.turn || 1}
              </div>
            )}
            <div className="px-3 py-1 bg-slate-600 rounded text-sm font-semibold">
              🎮 Game: {matchID || 'default'}
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
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Left Panel - Unit Selection & Info */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Setup Phase Unit Selection */}
            {phase === 'setup' && (
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
                      onClick={() => unit.type !== 'WARSHIP' && setSelectedUnitType(unit.type)}
                      disabled={unit.type === 'WARSHIP'}
                      className={`w-full p-2 rounded border text-left transition-all ${
                        unit.type === 'WARSHIP'
                          ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                          : selectedUnitType === unit.type 
                            ? 'border-amber-400 bg-amber-400/20' 
                            : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{unit.emoji}</span>
                        <div>
                          <div className="font-semibold">
                            {unit.name}
                            {unit.type === 'WARSHIP' && (
                              <span className="ml-2 text-xs text-red-400 font-normal">(Unavailable)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {unit.type === 'WARSHIP' 
                              ? 'Naval units require water terrain - coming soon!' 
                              : unit.description
                            }
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Selected Unit Info */}
            {selectedUnit && (
              <UnitInfoPanel unit={selectedUnit} isSelected={true} />
            )}
            
            {/* My Units */}
            {myUnits.length > 0 && (
              <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                <h3 className="text-lg font-semibold text-amber-400 mb-3">👥 Your Units</h3>
                <div className="space-y-2">
                  {myUnits.map(unit => (
                    <UnitInfoPanel 
                      key={unit.id} 
                      unit={unit} 
                      isSelected={G.selectedUnitId === unit.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Center - Game Board */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <GameBoard
                onHexClick={handleHexClick}
                onHexHover={setHoveredHex}
                onHexHoverEnd={() => setHoveredHex(null)}
                selectedHex={selectedHex}
                highlightedHexes={highlightedHexes}
                attackableHexes={attackableHexes}
                units={G.units}
                hexes={G.hexes || []}
                mapSize={G.mapSize || null}
                terrainMap={G.terrainMap}
                selectedUnitId={G.selectedUnitId}
                currentPlayerID={playerID}
                damagePreview={damagePreview}
              />
            </div>
          </div>
          
          {/* Right Panel - Enemy Units & Controls */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Enemy Units */}
            {enemyUnits.length > 0 && (
              <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                <h3 className="text-lg font-semibold text-red-400 mb-3">⚔️ Enemy Units</h3>
                <div className="space-y-2">
                  {enemyUnits.map(unit => (
                    <UnitInfoPanel 
                      key={unit.id} 
                      unit={unit} 
                      isSelected={false}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Game Controls */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">🎮 Game Controls</h3>
              
              {phase === 'setup' && (
                <button
                  onClick={() => moves.readyForBattle()}
                  disabled={!isMyTurn || myUnits.length === 0}
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
              )}
              
              {phase === 'battle' && (
                <div className="space-y-2">
                  <button
                    onClick={handleUndoMove}
                    disabled={!isMyTurn || !selectedUnit?.lastMove || selectedUnit?.hasAttacked}
                    className="w-full py-2.5 rounded-lg font-bold bg-slate-700 hover:bg-slate-600 transition-all disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    ↩ Undo Move
                  </button>
                  <button
                    onClick={handleEndTurn}
                    disabled={!isMyTurn}
                    className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 transition-all disabled:bg-slate-600 disabled:cursor-not-allowed"
                  >
                    ✓ End Turn
                  </button>
                </div>
              )}
            </div>
            
            {/* Game Log */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">📜 Battle Log</h3>
              <div className="h-48 overflow-y-auto space-y-1">
                {G.log.slice().reverse().map((entry, index) => (
                  <div key={index} className="text-xs text-slate-300 border-l-2 border-amber-400 pl-2">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Victory Screen */}
      {showVictoryScreen && ctx.gameover && (
        <VictoryScreen
          gameOver={ctx.gameover}
          winner={ctx.gameover?.winner}
          victoryData={ctx.gameover}
          onClose={() => setShowVictoryScreen(false)}
          playerID={playerID}
          units={G.units}
        />
      )}
    </div>
  )
}

// Create the network boardgame.io client
const MedievalBattleClient = Client({
  game: MedievalBattleGame,
  board: BattleBoard,
  multiplayer: SocketIO({ server: 'http://localhost:8000' }),
  debug: false,
})

// Multiplayer Game Page
export default function MultiplayerPage() {
  const [playerID, setPlayerID] = useState('0')
  const [matchID, setMatchID] = useState('default')
  const [joined, setJoined] = useState(false)
  
  return (
    <div className="min-h-screen bg-slate-900">
      {!joined ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full">
            <h1 className="text-2xl font-bold text-amber-400 mb-6 text-center">
              ⚔️ Join Multiplayer Battle
            </h1>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Player ID (0 or 1)
                </label>
                <input
                  type="text"
                  value={playerID}
                  onChange={(e) => setPlayerID(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="Enter 0 or 1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Match ID (optional)
                </label>
                <input
                  type="text"
                  value={matchID}
                  onChange={(e) => setMatchID(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  placeholder="Leave empty for random match"
                />
              </div>
              
              <button
                onClick={() => setJoined(true)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition-all"
              >
                🎮 Join Battle
              </button>
            </div>
            
            <div className="mt-6 text-xs text-slate-400">
              <p>💡 Two players need to join the same match ID to play together.</p>
              <p>🌐 Make sure the game server is running on localhost:8000</p>
            </div>
          </div>
        </div>
      ) : (
        <MedievalBattleClient playerID={playerID} matchID={matchID || 'default'} />
      )}
    </div>
  )
}
