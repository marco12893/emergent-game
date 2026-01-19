'use client'

import React, { useState, useEffect } from 'react'
import { UNIT_TYPES } from '@/game/GameLogic'
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
        <img 
          src={`/units/${unit.image || 'swordsman'}_${unit.ownerID === '0' ? 'blue' : 'red'}.png`}
          className="w-8 h-8"
          alt={unit.name || 'Unit'}
        />
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
  const [showVictoryScreen, setShowVictoryScreen] = useState(true) // Default to true, can be closed
  const [selectedUnitForInfo, setSelectedUnitForInfo] = useState(null) // New state for unit info display
  const [showUnitInfoPopup, setShowUnitInfoPopup] = useState(null) // New state for unit info popup
  
  // Dynamic server URL for production
  const getServerUrl = () => {
    if (typeof window !== 'undefined') {
      return process.env.NODE_ENV === 'production' 
        ? window.location.origin
        : 'http://localhost:3000'
    }
    return 'http://localhost:3000' // Fallback for SSR
  }
  
  const [serverUrl, setServerUrl] = useState(getServerUrl())
  
  // Update server URL on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerUrl(getServerUrl())
    }
  }, [])

  // Poll for game state updates
  useEffect(() => {
    if (!joined || !matchID || !serverUrl) return

    const pollInterval = setInterval(async () => {
      try {
        console.log('🔍 Polling game state from:', serverUrl)
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
      const requestBody = { gameId: matchID, action, payload }
      console.log('Sending request body:', requestBody)
      
      const response = await fetch(`${serverUrl}/api/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send action')
      }
    } catch (err) {
      console.error('Action error:', err)
      setError(err.message || 'Failed to send action to server')
    }
  }

  const handleHexClick = (hex) => {
    if (!joined || !gameState) return

    // Check if it's the current player's turn for game actions
    if (gameState.currentPlayer !== playerID) {
      // Only allow unit info display when not player's turn
      const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex) {
        // Toggle unit info selection
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfo(null) // Deselect if same unit
        } else {
          setSelectedUnitForInfo(unitOnHex) // Show info for any unit
        }
      } else {
        setSelectedUnitForInfo(null) // Clear selection when clicking empty hex
      }
      
      setError('Not your turn! (You can still view unit info)')
      setTimeout(() => setError(''), 2000)
      return
    }

    const phase = gameState.phase
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup') {
      // Check if clicking on own unit to remove it
      const myUnitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.ownerID === playerID)
      if (myUnitOnHex) {
        sendAction('removeUnit', { unitId: myUnitOnHex.id, playerID })
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
      // Check if clicking on own unit to select it for action
      const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex && unitOnHex.ownerID === playerID) {
        sendAction('selectUnit', { unitId: unitOnHex.id, playerID })
        // Also show unit info for own units
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfo(null) // Deselect if same unit
        } else {
          setSelectedUnitForInfo(unitOnHex) // Show info for own unit
        }
        return
      }
      
      // If we have a selected unit for action
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
    
    // Unit info display for any remaining clicks (when it's your turn but no action was taken)
    const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
    if (unitOnHex) {
      // Toggle unit info selection
      if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
        setSelectedUnitForInfo(null) // Deselect if same unit
      } else {
        setSelectedUnitForInfo(unitOnHex) // Show info for any unit
      }
    } else {
      setSelectedUnitForInfo(null) // Clear selection when clicking empty hex
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
          
          <div className="mt-6 text-xs text-slate-400">
          </div>
        </div>
      </div>
    )
  }

  const myUnits = gameState?.units?.filter(u => u.ownerID === playerID) || []
  const isMyTurn = gameState?.currentPlayer === playerID

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white relative">
      {/* Fullscreen Game Board */}
      <div className="absolute inset-0">
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
      
      {/* Centered Top Info Box */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20">
        <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-6 py-3 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Turn:</span>
              <span className="text-white font-bold">{gameState?.turn || 1}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Player:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
                {playerID}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Game:</span>
              <span className="text-white font-bold">{matchID || 'default'}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Unit Info Box - Right Side */}
      {selectedUnitForInfo && (
        <div className="fixed right-4 top-1/2 transform -translate-y-1/2 z-20">
          <div className={`p-4 rounded-lg border-2 shadow-xl backdrop-blur-sm ${
            selectedUnitForInfo.ownerID === playerID 
              ? 'border-amber-400 bg-amber-400/10' 
              : 'border-slate-600 bg-slate-800/90'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{selectedUnitForInfo.emoji || '⚔️'}</span>
              <div>
                <div className="font-bold text-white text-lg">{selectedUnitForInfo.name || 'Unit'}</div>
                <div className={`text-sm ${selectedUnitForInfo.ownerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                  Player {selectedUnitForInfo.ownerID}
                </div>
              </div>
            </div>
            
            {/* HP Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm text-slate-300 mb-1">
                <span>HP</span>
                <span>{selectedUnitForInfo.currentHP}/{selectedUnitForInfo.maxHP}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP > 0.5 
                      ? 'bg-green-500' 
                      : selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP > 0.25 
                        ? 'bg-yellow-500' 
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${(selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-700/50 p-2 rounded text-center">
                <div className="text-red-400 font-bold">⚔️ {selectedUnitForInfo.attackPower}</div>
                <div className="text-slate-400 text-xs">ATK</div>
              </div>
              <div className="bg-slate-700/50 p-2 rounded text-center">
                <div className="text-blue-400 font-bold">👟 {selectedUnitForInfo.movePoints}</div>
                <div className="text-slate-400 text-xs">MOV</div>
              </div>
              <div className="bg-slate-700/50 p-2 rounded text-center">
                <div className="text-purple-400 font-bold">🎯 {selectedUnitForInfo.range}</div>
                <div className="text-slate-400 text-xs">RNG</div>
              </div>
              <div className="bg-slate-700/50 p-2 rounded text-center">
                <div className="text-green-400 font-bold">🛡️ {selectedUnitForInfo.maxMovePoints}</div>
                <div className="text-slate-400 text-xs">MAX</div>
              </div>
            </div>
            
            {/* Action Status */}
            {(selectedUnitForInfo.hasMoved || selectedUnitForInfo.hasAttacked) && (
              <div className="text-xs text-slate-400 mt-2">
                {selectedUnitForInfo.hasMoved && <span className="mr-2">✓ Moved</span>}
                {selectedUnitForInfo.hasAttacked && <span>✓ Attacked</span>}
              </div>
            )}
            
            {/* Close button */}
            <button
              onClick={() => setSelectedUnitForInfo(null)}
              className="mt-3 w-full py-1 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Unit Info Popup */}
      {showUnitInfoPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{showUnitInfoPopup.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{showUnitInfoPopup.name}</h3>
                  <div className="text-sm text-slate-400">{showUnitInfoPopup.type}</div>
                </div>
              </div>
              <button
                onClick={() => setShowUnitInfoPopup(null)}
                className="text-slate-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* Description */}
            <div className="mb-4">
              <p className="text-slate-300 text-sm">{showUnitInfoPopup.description}</p>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-red-400 font-bold text-lg">⚔️ {showUnitInfoPopup.attackPower}</div>
                <div className="text-slate-400 text-xs">Attack Power</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-green-400 font-bold text-lg">❤️ {showUnitInfoPopup.maxHP}</div>
                <div className="text-slate-400 text-xs">Health Points</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-blue-400 font-bold text-lg">👟 {showUnitInfoPopup.movePoints}</div>
                <div className="text-slate-400 text-xs">Movement Points</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-purple-400 font-bold text-lg">🎯 {showUnitInfoPopup.range}</div>
                <div className="text-slate-400 text-xs">Attack Range</div>
              </div>
            </div>
            
            {/* Additional Info */}
            <div className="text-xs text-slate-400">
              <div className="mb-1">• Max Movement: {showUnitInfoPopup.movePoints} tiles per turn</div>
              <div className="mb-1">• Range: {showUnitInfoPopup.range === 1 ? 'Melee only' : `${showUnitInfoPopup.range} tiles`}</div>
              <div>• Type: {showUnitInfoPopup.type} unit</div>
            </div>
            
            {/* Close Button */}
            <button
              onClick={() => setShowUnitInfoPopup(null)}
              className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Deploy Unit Display - Bottom during setup phase only */}
      {gameState?.phase === 'setup' && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-6 py-3 shadow-xl backdrop-blur-sm">
            <div className="text-center mb-2">
              <span className="text-amber-400 font-semibold">Deploy Units:</span>
            </div>
            <div className="flex gap-3">
              {Object.values(UNIT_TYPES).filter(unit => unit.type !== 'WARSHIP').map(unit => (
                <button
                  key={unit.type}
                  onClick={() => setSelectedUnitType(unit.type)}
                  className={`relative px-4 py-2 rounded border text-sm transition-all transform hover:scale-105 ${
                    selectedUnitType === unit.type 
                      ? 'border-amber-400 bg-amber-400/20 text-amber-400' 
                      : 'border-slate-600 hover:border-slate-500 text-white'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <img 
                      src={`/units/${unit.image}_${playerID === '0' ? 'blue' : 'red'}.png`}
                      className="w-24 h-24"
                      alt={unit.name}
                    />
                    <span className="font-semibold text-xs">{unit.name}</span>
                  </div>
                  {/* Info button */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowUnitInfoPopup(unit)
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 hover:bg-blue-400 text-white rounded-full text-xs font-bold flex items-center justify-center transition-all cursor-pointer"
                  >
                    i
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Fixed Position End Turn/Ready for Battle Button */}
      <div className="fixed bottom-4 right-4 z-30">
        {gameState?.phase === 'setup' && (
          <button
            onClick={readyForBattle}
            disabled={!isMyTurn}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
          >
            🚀 Ready for Battle
          </button>
        )}
        
        {gameState?.phase === 'battle' && (
          <button
            onClick={endTurn}
            disabled={!isMyTurn}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
          >
            ⏭️ End Turn
          </button>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 p-3 bg-red-600/90 border border-red-600 rounded text-red-400 text-sm z-20">
          {error}
        </div>
      )}
      
      {/* Victory Screen */}
      {showVictoryScreen && gameState?.gameOver && (
        <VictoryScreen
          gameOver={gameState.gameOver}
          winner={gameState.gameOver?.winner}
          victoryData={gameState.gameOver}
          onClose={() => setShowVictoryScreen(false)}
          playerID={playerID}
          units={gameState.units}
        />
      )}
    </div>
  )
}
