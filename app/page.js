'use client'

import React, { useState, useEffect } from 'react'
import { UNIT_TYPES } from '@/game/GameLogic'
import { DEFAULT_MAP_ID, MAPS } from '@/game/maps'
import GameBoard from '@/components/GameBoard'
import VictoryScreen from '@/components/VictoryScreen'

// Landscape detection component
const LandscapePrompt = () => {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  if (!isPortrait) return null

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-sm text-center">
        <div className="text-4xl mb-4">📱</div>
        <h2 className="text-xl font-bold text-white mb-2">Please Rotate Your Device</h2>
        <p className="text-slate-300 mb-4">
          This game is best experienced in landscape mode for optimal gameplay and controls.
        </p>
        <div className="flex items-center justify-center gap-2 text-amber-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-semibold">Rotate to landscape</span>
        </div>
      </div>
    </div>
  )
}

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
  const [playerName, setPlayerName] = useState('')
  const [preferredPlayerID, setPreferredPlayerID] = useState('0')
  const [lobbyGames, setLobbyGames] = useState([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState(DEFAULT_MAP_ID)
  const [storedSession, setStoredSession] = useState(null)
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [highlightedHexes, setHighlightedHexes] = useState([])
  const [attackableHexes, setAttackableHexes] = useState([])
  const [showVictoryScreen, setShowVictoryScreen] = useState(true) // Default to true, can be closed
  const [selectedUnitForInfo, setSelectedUnitForInfo] = useState(null) // New state for unit info display
  const [showUnitInfoPopup, setShowUnitInfoPopup] = useState(null) // New state for unit info popup
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false) // State for collapsible left panel
  
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedSession = JSON.parse(localStorage.getItem('lobbySession') || 'null')
      if (savedSession?.playerName) {
        setPlayerName(savedSession.playerName)
      }
      if (savedSession?.playerID) {
        setPreferredPlayerID(savedSession.playerID)
      }
      if (savedSession?.matchID) {
        setStoredSession(savedSession)
      }
    } catch (error) {
      console.error('Failed to read lobby session:', error)
    }
  }, [])

  const fetchLobbyGames = async () => {
    if (!serverUrl || joined) return
    setLobbyLoading(true)
    try {
      const response = await fetch(`${serverUrl}/api/lobby`)
      if (response.ok) {
        const data = await response.json()
        setLobbyGames(data.games || [])
      }
    } catch (err) {
      console.error('Failed to load lobby games:', err)
    } finally {
      setLobbyLoading(false)
    }
  }

  useEffect(() => {
    if (!serverUrl || joined) return
    fetchLobbyGames()
    const interval = setInterval(fetchLobbyGames, 3000)
    return () => clearInterval(interval)
  }, [serverUrl, joined])

  // Poll for game state updates
  useEffect(() => {
    if (!joined || !matchID || !serverUrl) return

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
                      PLAIN: { moveCost: 1, passable: true, waterOnly: false },
                      FOREST: { moveCost: 1, passable: true, waterOnly: false },
                      HILLS: { moveCost: 2, passable: true, waterOnly: false },
                      MOUNTAIN: { moveCost: Infinity, passable: false, waterOnly: false },
                      WATER: { moveCost: 1, passable: true, waterOnly: true },
                    }
                    const terrainData = terrainTypes[terrain]
                    if (!terrainData) continue
                    
                    const isNaval = selectedUnit.isNaval || false
                    if (isNaval && !terrainData.waterOnly) continue
                    if (!isNaval && terrainData.waterOnly) continue
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

  const joinLobbyGame = async (gameId, requestedPlayerID, mapId) => {
    if (!gameId) {
      setError('Lobby ID not found.')
      return
    }

    const fallbackPlayerID = storedSession?.matchID === gameId ? storedSession.playerID : undefined
    const resolvedPlayerID = requestedPlayerID || fallbackPlayerID || preferredPlayerID

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${serverUrl}/api/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          gameId,
          playerID: resolvedPlayerID,
          playerName: playerName || undefined,
          mapId: mapId || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
        setPlayerID(data.playerID)
        setMatchID(gameId)
        setJoined(true)
        const nextSession = { matchID: gameId, playerID: data.playerID, playerName }
        setStoredSession(nextSession)
        if (typeof window !== 'undefined') {
          localStorage.setItem('lobbySession', JSON.stringify(nextSession))
        }
      } else if (response.status === 409) {
        const data = await response.json()
        setError(data.error || 'Lobby is full.')
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

  const createLobbyGame = async () => {
    const newLobbyId = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('')
    await joinLobbyGame(newLobbyId, preferredPlayerID, selectedMapId)
  }

  const sendAction = async (action, payload) => {
    if (!joined) return

    try {
      const requestBody = { gameId: matchID, action, payload }
      
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
      
      // Don't show error message when just viewing unit info
      return
    }

    const phase = gameState.phase
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup') {
      // Check if clicking on any unit to show info
      const unitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex) {
        // Toggle unit info for any unit during setup
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfo(null) // Deselect if same unit
        } else {
          setSelectedUnitForInfo(unitOnHex) // Show info for any unit
        }
      } else {
        setSelectedUnitForInfo(null) // Clear selection when clicking empty hex
      }

      // Check if clicking on own unit to remove it
      const myUnitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.ownerID === playerID)
      if (myUnitOnHex) {
        sendAction('removeUnit', { unitId: myUnitOnHex.id, playerID })
        return
      }

      // Try to place a new unit
      const mapWidth = gameState?.mapSize?.width || 6
      const leftSpawnMax = -mapWidth + 1
      const rightSpawnMin = mapWidth - 2
      const isSpawnZone = playerID === '0' ? hex.q <= leftSpawnMax : hex.q >= rightSpawnMin
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
        // Automatically show unit info when selecting own unit
        setSelectedUnitForInfo(unitOnHex)
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
            ⚔️ Lobby Multiplayer
          </h1>
          
          {error && (
            <div className="mb-4 p-3 bg-red-600/20 border border-red-600 rounded text-red-400 text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Player Name (optional)
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Preferred Player Slot
              </label>
              <select
                value={preferredPlayerID}
                onChange={(e) => setPreferredPlayerID(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                <option value="0">Player 0</option>
                <option value="1">Player 1</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Map Selection
              </label>
              <select
                value={selectedMapId}
                onChange={(e) => setSelectedMapId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                {Object.values(MAPS).map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                {MAPS[selectedMapId]?.description}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createLobbyGame}
                disabled={loading}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white font-bold rounded-lg transition-all"
              >
                {loading ? '🔄 Creating...' : '➕ Create New Lobby'}
              </button>
              <button
                onClick={fetchLobbyGames}
                disabled={lobbyLoading}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-all"
              >
                {lobbyLoading ? '⏳' : '🔄'}
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Lobby List</span>
                <span className="text-xs text-slate-500">
                  {lobbyGames.length} available
                </span>
              </div>

              {lobbyGames.length === 0 ? (
                <div className="text-sm text-slate-400 bg-slate-700/50 border border-slate-600 rounded-lg p-4 text-center">
                  No active lobbies yet. Create a new lobby to start playing.
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {lobbyGames.map((game) => {
                    const isFull = game.status === 'full'
                    return (
                      <div
                        key={game.id}
                        className="border border-slate-600 rounded-lg p-3 bg-slate-700/40"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {game.id}
                            </div>
                            <div className="text-xs text-slate-400">
                              Status: {game.status === 'waiting' ? 'Waiting for opponent' : game.status === 'open' ? 'Open' : 'Full'}
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            isFull ? 'bg-red-600/60 text-red-200' : 'bg-emerald-600/50 text-emerald-200'
                          }`}>
                            {game.playerCount}/2
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {game.players.length > 0 ? (
                            game.players.map((player) => (
                              <span
                                key={player.id}
                                className="text-xs bg-slate-800/80 border border-slate-600 rounded-full px-2 py-1 text-slate-200"
                              >
                                {player.name} (P{player.id})
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">No players yet</span>
                          )}
                        </div>
                        <button
                          onClick={() => joinLobbyGame(game.id, preferredPlayerID)}
                          disabled={loading || isFull}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-all"
                        >
                          {isFull ? 'Lobby Full' : game.status === 'waiting' ? '🎯 Join & Battle' : '🎮 Enter Lobby'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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
      {/* Landscape Prompt */}
      <LandscapePrompt />
      
      {/* Status Bar - Hidden when deploy panel is open */}
      {<div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-20 transition-all duration-300
        ${(gameState?.phase === 'setup' && !isLeftPanelCollapsed) 
          ? 'hidden lg:block'  // Mobile/Tablet: Hidden, Desktop: Force Block
          : 'block'            // Default: Selalu Block
        }
      `}>
        <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-4 py-2 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-center gap-6 text-sm">
            
            {/* Current Turn Indicator */}
            <div className="flex items-center gap-2">
              {isMyTurn ? (
                <span className="text-green-400 font-bold animate-pulse">YOUR TURN</span>
              ) : (
                <>
                  <span className="text-amber-400 font-semibold">Current Turn:</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    gameState?.currentPlayer === '0' ? 'bg-blue-600' : 'bg-red-600'
                  }`}>
                    Player {gameState?.currentPlayer || '?'}
                  </span>
                </>
              )}
            </div>
            
            {/* Turn Number */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Turn:</span>
              <span className="text-white font-bold">{gameState?.turn || 1}</span>
            </div>
            
            {/* Game Phase */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Phase:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                gameState?.phase === 'setup' ? 'bg-purple-600' : 'bg-orange-600'
              }`}>
                {gameState?.phase?.toUpperCase() || 'SETUP'}
              </span>
            </div>
            
            {/* Your Player ID */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">You:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
                Player {playerID}
              </span>
            </div>
            
            {/* Game ID */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Game:</span>
              <span className="text-white font-bold text-xs">{matchID || 'default'}</span>
            </div>
          </div>
        </div>
      </div>
      }
      
      {/* Left Panel - Only visible during setup phase */}
      {gameState?.phase === 'setup' && (
        <div className={`fixed left-0 top-0 z-40 transition-all duration-300 ${
          isLeftPanelCollapsed ? 'w-12' : 'w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5 xl:w-1/6'
        } bg-slate-800/95 border-r border-slate-600 backdrop-blur-sm h-full`}>
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            className="absolute -right-3 top-4 w-6 h-6 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-full flex items-center justify-center text-xs transition-all z-40"
          >
            {isLeftPanelCollapsed ? '▶' : '◀'}
          </button>
          
          {/* Panel Content */}
          <div className={`h-full overflow-hidden transition-all duration-300 ${
            isLeftPanelCollapsed ? 'opacity-0' : 'opacity-100'
          }`}>
            <div className="p-4 space-y-4 h-full flex flex-col font-poppins">
              {/* Player Info Section */}
              <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                <img 
                  src={`/units/General_${playerID === '0' ? 'blue' : 'red'}.png`}
                  className="w-12 h-12"
                  alt="Player Avatar"
                />
                <div>
                  <div className="text-white font-bold text-sm">Player {playerID}</div>
                  <div className={`text-xs ${playerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                    {playerID === '0' ? 'Blue Army' : 'Red Army'}
                  </div>
                </div>
              </div>
              
              {/* Deployment Units */}
              <div className="flex-1 overflow-y-auto">
                <div className="text-base text-amber-400 font-bold mb-2 bg-slate-800/95 backdrop-blur-sm py-2">
                  DEPLOY UNITS
                </div>
                <div className="space-y-3 pb-12">
                  {Object.values(UNIT_TYPES).filter(unit => unit.type !== 'WARSHIP').map(unit => (
                    <button
                      key={unit.type}
                      onClick={() => setSelectedUnitType(unit.type)}
                      className={`relative w-full p-6 rounded border text-sm transition-all flex flex-col items-center font-poppins ${
                        selectedUnitType === unit.type 
                          ? 'border-amber-400 bg-amber-400/20 text-amber-400' 
                          : 'border-slate-600 hover:border-slate-500 text-white'
                      }`}
                    >
                      {/* Info button in top right corner */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowUnitInfoPopup(unit)
                        }}
                        className="absolute top-2 right-2 w-6 h-6 bg-blue-500 hover:bg-blue-400 text-white rounded-full text-xs font-bold flex items-center justify-center cursor-pointer"
                      >
                        i
                      </div>
                      
                      {/* Unit image */}
                      <img 
                        src={`/units/${unit.image}_${playerID === '0' ? 'blue' : 'red'}.png`}
                        className="w-32 h-32 mb-1"
                        alt={unit.name}
                      />
                      
                      {/* Unit name */}
                      <span className="font-semibold text-base mt-auto">{unit.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Game Board Container */}
      <div className="absolute inset-0">
        <GameBoard
          onHexClick={handleHexClick}
          selectedHex={null}
          highlightedHexes={highlightedHexes}
          attackableHexes={attackableHexes}
          units={gameState?.units || []}
          hexes={gameState?.hexes || []}
          mapSize={gameState?.mapSize || null}
          terrainMap={gameState?.terrainMap || {}}
          selectedUnitId={gameState?.selectedUnitId || null}
          currentPlayerID={playerID}
        />
      </div>
      
      {/* Action Buttons - Bottom Right Corner */}
      <div className="fixed bottom-4 right-4 z-30">
        {gameState?.phase === 'setup' && (
          <button
            onClick={readyForBattle}
            disabled={!isMyTurn}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
          >
            Ready For Battle
          </button>
        )}
        
        {gameState?.phase === 'battle' && (
          <button
            onClick={endTurn}
            disabled={!isMyTurn}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
          >
            End Turn
          </button>
        )}
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
