'use client'

import React, { useState, useEffect } from 'react'
import { UNIT_TYPES } from '@/game/GameLogic'
import GameBoard from '@/components/GameBoard'

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
        <span className="text-2xl">{unit.emoji || '⚔️'}</span>
        <div>
          <div className="font-semibold text-white">{unit.name || 'Unit'}</div>
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
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
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
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-green-400">🛡️ {unit.maxMovePoints}</div>
          <div className="text-slate-500">MAX</div>
        </div>
      </div>
      
      {/* Action Status */}
      {(unit.hasMoved || unit.hasAttacked) && (
        <div className="text-xs text-slate-400">
          {unit.hasMoved && <span className="mr-2">✓ Moved</span>}
          {unit.hasAttacked && <span>✓ Attacked</span>}
        </div>
      )}
    </div>
  )
}

export default function HTTPMultiplayerPage() {
  const [gameState, setGameState] = useState(null)
  const [playerID, setPlayerID] = useState('')
  const [matchID, setMatchID] = useState('')
  const [joined, setJoined] = useState(false)
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [highlightedHexes, setHighlightedHexes] = useState([])
  const [attackableHexes, setAttackableHexes] = useState([])
  
  // Dynamic server URL for production
  const serverUrl = process.env.NODE_ENV === 'production' 
    ? process.env.NEXT_PUBLIC_GAME_SERVER_URL_PROD || 'https://emergent-game.vercel.app'
    : process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'http://localhost:3000'

  // Poll for game state updates
  useEffect(() => {
    if (!joined || !matchID) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${serverUrl}/api/game/${matchID}`)
        if (response.ok) {
          const state = await response.json()
          setGameState(state)
          
          // Update highlighting when game state changes
          if (state.phase === 'battle' && state.selectedUnitId) {
            const selectedUnit = state.units.find(u => u.id === state.selectedUnitId)
            if (selectedUnit && selectedUnit.ownerID === playerID) {
              // Calculate reachable hexes based on unit movement points and terrain
              const reachable = []
              
              // BFS for movement calculation with terrain costs
              const visited = new Set()
              const queue = [{ q: selectedUnit.q, r: selectedUnit.r, s: selectedUnit.s, remainingMove: selectedUnit.movePoints }]
              visited.add(`${selectedUnit.q},${selectedUnit.r}`)
              
              while (queue.length > 0) {
                const current = queue.shift()
                
                // Check all 6 directions
                const directions = [
                  { q: 1, r: 0, s: -1 },
                  { q: 1, r: -1, s: 0 },
                  { q: 0, r: -1, s: 1 },
                  { q: -1, r: 0, s: 1 },
                  { q: -1, r: 1, s: 0 },
                  { q: 0, r: 1, s: -1 },
                ]
                
                for (const dir of directions) {
                  const targetQ = current.q + dir.q
                  const targetR = current.r + dir.r
                  const targetS = current.s + dir.s
                  const key = `${targetQ},${targetR}`
                  
                  if (visited.has(key)) continue
                  
                  // Check if hex exists and is not occupied
                  const hexExists = state.hexes.some(h => h.q === targetQ && h.r === targetR)
                  const isOccupied = state.units.some(u => u.q === targetQ && u.r === targetR)
                  
                  if (hexExists && !isOccupied && !selectedUnit.hasMoved) {
                    // Check terrain costs
                    const terrain = state.terrainMap[key] || 'PLAIN'
                    const terrainTypes = {
                      PLAIN: { moveCost: 1, passable: true },
                      FOREST: { moveCost: 1, passable: true },
                      MOUNTAIN: { moveCost: Infinity, passable: false }
                    }
                    const terrainData = terrainTypes[terrain]
                    
                    if (!terrainData.passable) continue
                    
                    const moveCost = terrainData.moveCost
                    const remainingAfterMove = current.remainingMove - moveCost
                    
                    if (remainingAfterMove >= 0) {
                      visited.add(key)
                      reachable.push({ q: targetQ, r: targetR, s: targetS })
                      
                      // Continue exploring if we have movement left
                      if (remainingAfterMove > 0) {
                        queue.push({ q: targetQ, r: targetR, s: targetS, remainingMove: remainingAfterMove })
                      }
                    }
                  }
                }
              }
              
              // Calculate attackable hexes
              const attackable = []
              for (const unit of state.units) {
                if (unit.ownerID !== playerID && unit.currentHP > 0) {
                  const distance = Math.max(
                    Math.abs(selectedUnit.q - unit.q),
                    Math.abs(selectedUnit.r - unit.r),
                    Math.abs(selectedUnit.s - unit.s)
                  )
                  
                  if (distance <= selectedUnit.range && !selectedUnit.hasAttacked) {
                    attackable.push({ q: unit.q, r: unit.r, s: unit.s })
                  }
                }
              }
              
              setHighlightedHexes(reachable)
              setAttackableHexes(attackable)
            }
          } else {
            setHighlightedHexes([])
            setAttackableHexes([])
          }
        }
      } catch (err) {
        console.error('Failed to poll game state:', err)
      }
    }, 1000) // Poll every second

    return () => clearInterval(pollInterval)
  }, [joined, matchID, playerID])

  const connectToGame = async () => {
    if (!playerID || !matchID) {
      setError('Please enter Player ID and Match ID')
      return
    }

    setLoading(true)
    setError('')

    try {
      console.log('Connecting to game:', { matchID, playerID })
      
      const response = await fetch(`${serverUrl}/api/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameId: matchID, playerID }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Connected successfully:', data)
        setGameState(data.gameState)
        setJoined(true)
      } else {
        throw new Error('Failed to join game')
      }
    } catch (err) {
      console.error('Connection error:', err)
      setError('Failed to connect to game server. Make sure server is running on localhost:8000')
    } finally {
      setLoading(false)
    }
  }

  const sendAction = async (action, payload) => {
    if (!joined) return

    try {
      const response = await fetch(`${serverUrl}/api/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameId: matchID, action, payload }),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
      } else {
        throw new Error('Failed to send action')
      }
    } catch (err) {
      console.error('Action error:', err)
      setError('Failed to send action to server')
    }
  }

  const handleHexClick = (hex) => {
    if (!joined || !gameState) return

    // Check if it's the current player's turn
    if (gameState.currentPlayer !== playerID) {
      setError('Not your turn!')
      setTimeout(() => setError(''), 2000)
      return
    }

    const phase = gameState.phase
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup') {
      // Check if clicking on own unit to remove it
      const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.ownerID === playerID)
      if (unitOnHex) {
        sendAction('removeUnit', { unitId: unitOnHex.id, playerID })
        return
      }

      // Try to place a new unit
      const isSpawnZone = playerID === '0' ? hex.q <= -5 : hex.q >= 4
      if (isSpawnZone) {
        sendAction('placeUnit', {
          unitType: selectedUnitType,
          q: hex.q,
          r: hex.r,
          playerID
        })
      } else {
        setError('You can only place units in your spawn zone!')
        setTimeout(() => setError(''), 2000)
      }
      return
    }
    
    // Battle Phase: Select, Move, or Attack
    if (phase === 'battle') {
      const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      
      // Check if clicking on own unit to select it
      if (unitOnHex && unitOnHex.ownerID === playerID) {
        sendAction('selectUnit', { unitId: unitOnHex.id, playerID })
        return
      }
      
      // If we have a selected unit
      const selectedUnit = gameState.selectedUnitId ? 
        gameState.units.find(u => u.id === gameState.selectedUnitId) : null
        
      if (selectedUnit && selectedUnit.ownerID === playerID) {
        // Check if clicking on enemy to attack
        if (unitOnHex && unitOnHex.ownerID !== playerID) {
          // Simple distance check
          const distance = Math.max(
            Math.abs(selectedUnit.q - unitOnHex.q),
            Math.abs(selectedUnit.r - unitOnHex.r),
            Math.abs(selectedUnit.s - unitOnHex.s)
          )
          
          if (distance <= selectedUnit.range && !selectedUnit.hasAttacked) {
            sendAction('attackUnit', { 
              attackerId: selectedUnit.id, 
              targetId: unitOnHex.id, 
              playerID 
            })
            return
          }
        }
        
        // Check if clicking on empty hex to move
        if (!unitOnHex && !selectedUnit.hasMoved) {
          // Check if hex is in reachable hexes (already calculated with proper move points)
          const isReachable = highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)
          if (isReachable) {
            sendAction('moveUnit', {
              unitId: selectedUnit.id,
              targetQ: hex.q,
              targetR: hex.r,
              playerID
            })
            return
          }
        }
        
        // Deselect if clicking elsewhere
        sendAction('deselectUnit', { playerID })
      }
    }
  }

  const endTurn = () => {
    if (!joined) return
    sendAction('endTurn', { playerID })
  }

  const readyForBattle = () => {
    if (!joined) return
    sendAction('readyForBattle', { playerID })
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-amber-400 mb-6 text-center">
            ⚔️ HTTP Multiplayer Battle
          </h1>
          
          {error && (
            <div className="mb-4 p-3 bg-red-600/20 border border-red-600 rounded text-red-400 text-sm">
              {error}
            </div>
          )}
          
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
                Match ID
              </label>
              <input
                type="text"
                value={matchID}
                onChange={(e) => setMatchID(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="Enter match ID"
              />
            </div>
            
            <button
              onClick={connectToGame}
              disabled={!playerID || !matchID || loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white font-bold rounded-lg transition-all"
            >
              {loading ? '🔄 Connecting...' : '🎮 Connect & Join Battle'}
            </button>
          </div>
          
          </div>
      </div>
    )
  }

  const myUnits = gameState?.units?.filter(u => u.ownerID === playerID) || []
  const isMyTurn = gameState?.currentPlayer === playerID

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-400">
            ⚔️ Medieval Battle - HTTP Multiplayer
          </h1>
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
              Player {playerID}
            </div>
            <div className="text-sm text-slate-400">
              🔄 Auto-updating
            </div>
          </div>
        </div>
      </header>

      {/* Turn Banner */}
      <div className={`py-2 text-center font-bold text-lg ${
        isMyTurn ? 'bg-green-600/80' : 'bg-slate-700/80'
      }`}>
        {isMyTurn ? "🎯 YOUR TURN!" : `⏳ Waiting for Player ${gameState?.currentPlayer}...`}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-600/20 border border-red-600 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main Game Area */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Left Panel - Unit Selection & Info */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Unit Selection */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h2 className="text-lg font-semibold text-amber-400 mb-3">
                {gameState?.phase === 'setup' ? '🎖️ Place Units' : '⚔️ Battle Phase'}
              </h2>
              
              {gameState?.phase === 'battle' && (
                <div className="mb-3 p-2 bg-blue-600/20 border border-blue-600 rounded text-blue-400 text-xs">
                  <p>💡 Click your units to select them</p>
                  <p>🟢 Green hexes = movement options (based on movement points)</p>
                  <p>🔴 Red hexes = attack targets</p>
                  <p>⚔️ Swordsman: 2 move, 25 ATK | Archer: 2 move, 30 ATK | Knight: 3 move, 30 ATK | Militia: 2 move, 20 ATK | Catapult: 1 move, 50 ATK | Warship: 3 move, 30 ATK (naval)</p>
                </div>
              )}
              
              {gameState?.phase === 'setup' && (
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
                          <div className="font-semibold">{unit.name}</div>
                          <div className="text-xs text-slate-400">{unit.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* My Units */}
            {myUnits.length > 0 && (
              <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
                <h3 className="text-lg font-semibold text-amber-400 mb-3">👥 Your Units</h3>
                <div className="space-y-2">
                  {myUnits.map(unit => (
                    <UnitInfoPanel key={unit.id} unit={unit} isSelected={false} />
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
                selectedHex={null}
                highlightedHexes={highlightedHexes}
                attackableHexes={attackableHexes}
                units={gameState?.units || []}
                terrainMap={gameState?.terrainMap || {}}
                selectedUnitId={gameState?.selectedUnitId || null}
                currentPlayerID={playerID}
              />
            </div>
          </div>
          
          {/* Right Panel - Controls & Log */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Game Controls */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">🎮 Game Controls</h3>
              
              <div className="space-y-2">
                {gameState?.phase === 'setup' && (
                  <>
                    <button
                      onClick={readyForBattle}
                      disabled={!isMyTurn}
                      className="w-full py-3 rounded-lg font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 transition-all"
                    >
                      🚀 Ready for Battle
                    </button>
                    <button
                      onClick={endTurn}
                      disabled={!isMyTurn}
                      className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 transition-all"
                    >
                      ⏭️ End Turn
                    </button>
                  </>
                )}
                
                {gameState?.phase === 'battle' && (
                  <button
                    onClick={endTurn}
                    disabled={!isMyTurn}
                    className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 transition-all"
                  >
                    ⏭️ End Turn
                  </button>
                )}
              </div>
            </div>
            
            {/* Game Log */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">📜 Battle Log</h3>
              <div className="h-48 overflow-y-auto space-y-1">
                {gameState?.log?.slice().reverse().map((entry, index) => (
                  <div key={index} className="text-xs text-slate-300 border-l-2 border-amber-400 pl-2">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
