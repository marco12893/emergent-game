'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { UNIT_TYPES, TERRAIN_TYPES, getDeployableHexes, getVisibleHexesForPlayer, getVisibleUnitsForPlayer } from '@/game/GameLogic'
import { DEFAULT_MAP_ID, MAPS } from '@/game/maps'
import GameBoard from '@/components/GameBoard'
import ConfirmDialog from '@/components/ConfirmDialog'

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
  const [playerName, setPlayerName] = useState('')
  const [lobbyGames, setLobbyGames] = useState([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState(DEFAULT_MAP_ID)
  const [isWinter, setIsWinter] = useState(false)
  const [storedSession, setStoredSession] = useState(null)
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')
  const [joinAsSpectator, setJoinAsSpectator] = useState(false)
  const [error, setError] = useState('')
  const errorTimeoutRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [highlightedHexes, setHighlightedHexes] = useState([])
  const [attackableHexes, setAttackableHexes] = useState([])
  const [hoveredHex, setHoveredHex] = useState(null)
  const [damagePreview, setDamagePreview] = useState(null)
  const [showReadyConfirm, setShowReadyConfirm] = useState(false)
  const [forceLobbySelection, setForceLobbySelection] = useState(false)
  
  // Dynamic server URL for production
  const serverUrl = process.env.NODE_ENV === 'production' 
    ? process.env.NEXT_PUBLIC_GAME_SERVER_URL_PROD || 'https://emergent-game.vercel.app'
    : process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'http://localhost:3000'
  const shouldShowLobbySelection = forceLobbySelection || gameState?.phase === 'lobby'
  const isMyTurn = gameState?.currentPlayer === playerID
  const teamMode = gameState?.teamMode ?? false
  const fogOfWarEnabled = Boolean(gameState?.fogOfWarEnabled)
  const fogActive = fogOfWarEnabled && gameState?.phase === 'battle' && playerID !== 'spectator'

  const visibleHexes = useMemo(() => {
    if (!fogActive || !gameState) return null
    return getVisibleHexesForPlayer({
      units: gameState.units,
      hexes: gameState.hexes,
      terrainMap: gameState.terrainMap,
      playerID,
      teamMode,
    })
  }, [fogActive, gameState, playerID, teamMode])

  const visibleUnits = useMemo(() => {
    if (!gameState) return []
    if (!fogActive) return gameState.units || []
    return getVisibleUnitsForPlayer({
      units: gameState.units,
      hexes: gameState.hexes,
      terrainMap: gameState.terrainMap,
      playerID,
      teamMode,
    })
  }, [fogActive, gameState, playerID, teamMode])

  const fetchLobbyGames = async () => {
    if (joined) return
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
    if (joined) return
    fetchLobbyGames()
    const interval = setInterval(fetchLobbyGames, 3000)
    return () => clearInterval(interval)
  }, [joined])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedSession = JSON.parse(sessionStorage.getItem('lobbySession') || 'null')
      if (savedSession?.playerName) {
        setPlayerName(savedSession.playerName)
      }
      if (savedSession?.matchID) {
        setStoredSession(savedSession)
      }
    } catch (error) {
      console.error('Failed to read lobby session:', error)
    }
  }, [])

  useEffect(() => {
    if (!error) return undefined
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }
    errorTimeoutRef.current = setTimeout(() => {
      setError('')
      errorTimeoutRef.current = null
    }, 3000)
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [error])

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
                      PLAIN: { moveCost: 1, passable: true, waterOnly: false },
                      FOREST: { moveCost: 1, passable: true, waterOnly: false },
                      HILLS: { moveCost: 2, passable: true, waterOnly: false },
                      MOUNTAIN: { moveCost: Infinity, passable: false, waterOnly: false },
                      WATER: { moveCost: 1, passable: true, waterOnly: true },
                    }
                    const terrainData = terrainTypes[terrain]
                    if (!terrainData) continue
                    
                    const isNaval = selectedUnit.isNaval || false
                    const isTransport = selectedUnit.isTransport || false
                    const canEmbark = !isNaval && !isTransport && selectedUnit.movePoints >= selectedUnit.maxMovePoints
                    const canDisembark = isTransport && selectedUnit.movePoints >= selectedUnit.maxMovePoints
                    const embarking = terrainData.waterOnly && !isNaval && !isTransport
                    const disembarking = !terrainData.waterOnly && isTransport

                    if (embarking && !canEmbark) continue
                    if (!terrainData.waterOnly && isNaval && !isTransport) continue
                    if (disembarking && !canDisembark) continue
                    if (!terrainData.passable) continue
                    
                    const moveCost = embarking || disembarking
                      ? selectedUnit.maxMovePoints
                      : terrainData.moveCost
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
              const isFogActive = Boolean(state.fogOfWarEnabled) && state.phase === 'battle' && playerID !== 'spectator'
              const currentVisibleUnits = isFogActive
                ? getVisibleUnitsForPlayer({
                    units: state.units,
                    hexes: state.hexes,
                    terrainMap: state.terrainMap,
                    playerID,
                    teamMode,
                  })
                : state.units
              const attackable = []
              for (const unit of currentVisibleUnits) {
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
          } else if (state.phase !== 'setup') {
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

  useEffect(() => {
    if (!gameState || gameState.phase !== 'setup') return
    if (!isMyTurn) {
      setHighlightedHexes([])
      setAttackableHexes([])
      return
    }
    const mapWidth = gameState?.mapSize?.width || 6
    const deployableHexes = getDeployableHexes({
      unitType: selectedUnitType,
      hexes: gameState.hexes,
      units: gameState.units,
      terrainMap: gameState.terrainMap,
      playerID,
      mapWidth,
      teamMode,
    })
    setHighlightedHexes(deployableHexes)
    setAttackableHexes([])
  }, [gameState, isMyTurn, playerID, selectedUnitType, teamMode])

  useEffect(() => {
    if (!gameState || !hoveredHex || gameState.phase !== 'battle') {
      setDamagePreview(null)
      return
    }

    const selectedUnit = gameState.selectedUnitId
      ? gameState.units.find(u => u.id === gameState.selectedUnitId)
      : null

    if (!selectedUnit || selectedUnit.ownerID !== playerID || selectedUnit.hasAttacked) {
      setDamagePreview(null)
      return
    }

    const targetUnit = visibleUnits.find(
      u => u.q === hoveredHex.q && u.r === hoveredHex.r && u.ownerID !== playerID && u.currentHP > 0
    )

    if (!targetUnit) {
      setDamagePreview(null)
      return
    }

    const distance = Math.max(
      Math.abs(selectedUnit.q - targetUnit.q),
      Math.abs(selectedUnit.r - targetUnit.r),
      Math.abs(selectedUnit.s - targetUnit.s)
    )

    if (distance > selectedUnit.range) {
      setDamagePreview(null)
      return
    }

    const targetTerrain = gameState.terrainMap[`${targetUnit.q},${targetUnit.r}`] || 'PLAIN'
    const defenseBonus = TERRAIN_TYPES[targetTerrain]?.defenseBonus ?? 0
    const attackerTerrain = gameState.terrainMap[`${selectedUnit.q},${selectedUnit.r}`] || 'PLAIN'
    const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(selectedUnit.type)
      ? 5
      : 0
    const baseDamage = selectedUnit.attackPower + hillBonus

    const hpPercentage = selectedUnit.currentHP / selectedUnit.maxHP
    let damageMultiplier = 1.0
    if (hpPercentage > 0.75) {
      damageMultiplier = 1.0
    } else if (hpPercentage > 0.5) {
      damageMultiplier = 0.85
    } else if (hpPercentage > 0.25) {
      damageMultiplier = 0.70
    } else {
      damageMultiplier = 0.50
    }

    const reducedDamage = Math.round(baseDamage * damageMultiplier)
    const attackDamage = Math.max(1, reducedDamage - defenseBonus)
    const targetRemaining = targetUnit.currentHP - attackDamage

    let counterDamage = 0
    if (targetRemaining > 0 && distance <= targetUnit.range) {
      if (targetUnit.type !== 'CATAPULT' || targetUnit.isTransport) {
        const targetHpPercentage = targetRemaining / targetUnit.maxHP
        let targetDamageMultiplier = 1.0
        if (targetHpPercentage > 0.75) {
          targetDamageMultiplier = 1.0
        } else if (targetHpPercentage > 0.5) {
          targetDamageMultiplier = 0.85
        } else if (targetHpPercentage > 0.25) {
          targetDamageMultiplier = 0.70
        } else {
          targetDamageMultiplier = 0.50
        }

        const meleePenaltyMultiplier = targetUnit.type === 'ARCHER' && distance === 1 ? 0.5 : 1.0
        const targetReducedDamage = Math.round(
          targetUnit.attackPower * targetDamageMultiplier * meleePenaltyMultiplier
        )
        const attackerDefenseBonus = TERRAIN_TYPES[attackerTerrain]?.defenseBonus ?? 0
        counterDamage = Math.max(1, targetReducedDamage - attackerDefenseBonus)
      }
    }

    setDamagePreview({
      attackerId: selectedUnit.id,
      targetId: targetUnit.id,
      attackDamage,
      counterDamage,
    })
  }, [gameState, hoveredHex, playerID, visibleUnits])

  const joinLobbyGame = async (gameId, requestedPlayerID, mapId, winter) => {
    if (!gameId) {
      setError('Lobby ID not found.')
      return
    }

    const fallbackPlayerID = storedSession?.matchID === gameId ? storedSession.playerID : undefined
    const resolvedPlayerID = requestedPlayerID ?? fallbackPlayerID

    setLoading(true)
    setError('')

    try {
      const payload = {
        gameId,
        playerName: playerName || undefined,
        mapId: mapId || undefined,
        winter: typeof winter === 'boolean' ? winter : undefined,
      }
      if (resolvedPlayerID !== undefined && resolvedPlayerID !== null) {
        payload.playerID = resolvedPlayerID
      }

      const response = await fetch(`${serverUrl}/api/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
        setPlayerID(data.playerID)
        setMatchID(gameId)
        setJoined(true)
        setForceLobbySelection(
          data.playerID !== 'spectator' && data.gameState?.phase !== 'lobby'
        )
        const nextSession = { matchID: gameId, playerID: data.playerID, playerName }
        setStoredSession(nextSession)
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('lobbySession', JSON.stringify(nextSession))
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
    await joinLobbyGame(newLobbyId, joinAsSpectator ? 'spectator' : undefined, selectedMapId, isWinter)
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
      const mapWidth = gameState?.mapSize?.width || 6
      const deployableHexes = getDeployableHexes({
        unitType: selectedUnitType,
        hexes: gameState.hexes,
        units: gameState.units,
        terrainMap: gameState.terrainMap,
        playerID,
        mapWidth,
        teamMode,
      })
      const isDeployable = deployableHexes.some(h => h.q === hex.q && h.r === hex.r)
      if (isDeployable) {
        sendAction('placeUnit', {
          unitType: selectedUnitType,
          q: hex.q,
          r: hex.r,
          playerID
        })
      } else {
        setError('You can only place units in valid spawn hexes!')
        setTimeout(() => setError(''), 2000)
      }
      return
    }
    
    // Battle Phase: Select, Move, or Attack
    if (phase === 'battle') {
      const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      
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
    setHighlightedHexes([])
    setAttackableHexes([])
    setHoveredHex(null)
    setDamagePreview(null)
    sendAction('deselectUnit', { playerID })
    sendAction('endTurn', { playerID })
  }

  const undoMove = () => {
    if (!joined || !gameState) return
    const selectedUnit = gameState.selectedUnitId
      ? gameState.units.find(u => u.id === gameState.selectedUnitId)
      : null
    if (!selectedUnit || selectedUnit.hasAttacked || !selectedUnit.lastMove) return
    sendAction('undoMove', { unitId: selectedUnit.id, playerID })
    setDamagePreview(null)
  }

  const readyForBattle = () => {
    if (!joined) return
    const deployedUnits = gameState?.units?.filter(
      unit => unit.ownerID === playerID && unit.currentHP > 0
    ).length || 0
    if (deployedUnits === 0) {
      setShowReadyConfirm(true)
      return
    }
    sendAction('readyForBattle', { playerID })
  }

  const confirmReadyForBattle = () => {
    setShowReadyConfirm(false)
    sendAction('readyForBattle', { playerID })
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 lg:py-16">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">Medieval Tactical Battle</p>
              <h1 className="text-3xl font-bold text-amber-300 md:text-4xl">Pre-Game Lobby</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Set the battlefield, join as a player or spectator, and jump into a duel. Player slots are assigned
                automatically when you enter.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Map: {MAPS[selectedMapId]?.name}</span>
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Season: {isWinter ? 'Winter' : 'Standard'}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-amber-200">Create or Join</h2>
              <p className="mt-1 text-xs text-slate-400">Configure your duel lobby and invite a rival.</p>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Player name
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                    placeholder="Enter your banner name (optional)"
                  />
                </div>

                <div className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Role</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setJoinAsSpectator(false)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        joinAsSpectator
                          ? 'border-slate-700 bg-slate-900 text-slate-300'
                          : 'border-amber-400 bg-amber-400/10 text-amber-200'
                      }`}
                    >
                      🛡️ Join as Player
                      <p className="mt-1 text-xs font-normal text-slate-400">Pick any slot once you enter the lobby.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setJoinAsSpectator(true)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        joinAsSpectator
                          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300'
                      }`}
                    >
                      👁️ Watch as Spectator
                      <p className="mt-1 text-xs font-normal text-slate-400">Observe the duel live.</p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Map selection
                  </label>
                  <select
                    value={selectedMapId}
                    onChange={(e) => setSelectedMapId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  >
                    {Object.values(MAPS).map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-400">
                    {MAPS[selectedMapId]?.description}
                  </p>
                </div>

                <label className="flex items-start gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 p-4 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={isWinter}
                    onChange={(e) => setIsWinter(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span>
                    <span className="block font-semibold text-slate-100">Winter visuals</span>
                    <span className="text-xs text-slate-400">Snowy map art only.</span>
                  </span>
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={createLobbyGame}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-400 disabled:bg-slate-600"
                  >
                    {loading ? '🔄 Creating lobby...' : joinAsSpectator ? '👀 Create & Watch' : '➕ Create New Lobby'}
                  </button>
                  <button
                    onClick={fetchLobbyGames}
                    disabled={lobbyLoading}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-700"
                  >
                    {lobbyLoading ? '⏳ Refreshing...' : '🔄 Refresh'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-amber-200">Active Lobbies</h2>
                  <p className="text-xs text-slate-400">{lobbyGames.length} active rooms</p>
                </div>
                <button
                  onClick={fetchLobbyGames}
                  disabled={lobbyLoading}
                  className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:bg-slate-700"
                >
                  {lobbyLoading ? '⏳' : 'Refresh'}
                </button>
              </div>

              {lobbyGames.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-800/60 p-6 text-center text-sm text-slate-400">
                  No active lobbies yet. Create one to begin your battle.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {lobbyGames.map((game) => {
                    const isFull = game.status === 'full'
                    return (
                      <div
                        key={game.id}
                        className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{game.id}</div>
                            <div className="text-xs text-slate-400">{game.mapName}</div>
                            <div className="text-xs text-slate-400">
                              {game.isWinter ? 'Winter' : 'Standard'} • {game.fogOfWarEnabled ? 'Fog On' : 'Fog Off'} • {game.status === 'waiting' ? 'Waiting for opponent' : game.status}
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            isFull ? 'bg-red-600/60 text-red-200' : 'bg-emerald-600/50 text-emerald-200'
                          }`}>
                            {game.playerCount}/2
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {game.players.length > 0 ? (
                            game.players.map((player) => (
                              <span
                                key={player.id}
                                className="text-xs bg-slate-900/70 border border-slate-700 rounded-full px-2 py-1 text-slate-200"
                              >
                                {player.name} (P{player.id})
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">No players yet</span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => joinLobbyGame(game.id, joinAsSpectator ? 'spectator' : undefined)}
                            disabled={loading}
                            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:bg-slate-600"
                          >
                            {joinAsSpectator ? '👀 Watch Lobby' : '🎯 Enter Lobby'}
                          </button>
                          {!joinAsSpectator && (
                            <button
                              onClick={() => joinLobbyGame(game.id, 'spectator')}
                              disabled={loading}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              👁️ Spectate
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (shouldShowLobbySelection) {
    const lobbyPlayers = gameState?.players || {}
    const lobbyLeaderId = gameState?.leaderId
    const lobbyMap = MAPS[gameState?.mapId] || MAPS[selectedMapId]
    const playerCount = Object.keys(lobbyPlayers).length
    const canStartMatch = playerID === lobbyLeaderId && playerCount >= 2
    const canToggleFog = playerID === lobbyLeaderId && playerID !== 'spectator'
    const lobbyFogEnabled = Boolean(gameState?.fogOfWarEnabled)
    const slotConfig = [
      { id: '0', label: 'Team 1' },
      { id: '1', label: 'Team 2' },
    ]

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">Match Lobby</p>
              <h1 className="text-3xl font-bold text-amber-200">Choose Your Command Slot</h1>
              <p className="mt-1 text-sm text-slate-400">Lobby {matchID} • 1v1 Duel</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Players: {playerCount}/2</span>
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Leader: {lobbyLeaderId ?? 'TBD'}</span>
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Map: {lobbyMap?.name}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr_1fr]">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="mb-4 text-sm font-semibold text-blue-200">TEAM 1</div>
              {slotConfig.slice(0, 1).map(slot => {
                const occupant = lobbyPlayers[slot.id]
                const isCurrent = slot.id === playerID
                const isOccupied = Boolean(occupant)
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{slot.label}</div>
                      <div className="text-xs text-slate-400">
                        {occupant ? occupant.name : 'Add the player'}
                        {lobbyLeaderId === slot.id && <span className="ml-2 text-amber-300">(Leader)</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => sendAction('claimSlot', { playerID, desiredSlot: slot.id, playerName: playerName || undefined })}
                      className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800"
                    >
                      {isCurrent ? 'Your Slot' : isOccupied ? 'Claim' : 'Join'}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Battlefield</div>
              <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-800/70 p-4 text-center">
                <div className="text-sm font-semibold text-amber-200">{lobbyMap?.name || 'Random Map'}</div>
                <div className="mx-auto mt-3 flex h-40 w-full max-w-[220px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 text-4xl text-slate-500">
                  🗺️
                </div>
                <p className="mt-3 text-xs text-slate-400">{lobbyMap?.description}</p>
              </div>
              <div className="mt-4 rounded-lg bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-slate-200">Fog of war</div>
                    <div className="text-[11px] text-slate-400">Shared team vision + concealment.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendAction('setFogOfWar', { playerID, enabled: !lobbyFogEnabled })}
                    disabled={!canToggleFog}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      lobbyFogEnabled
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-slate-700 text-slate-200'
                    } ${canToggleFog ? 'hover:bg-emerald-500/30' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    {lobbyFogEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {!canToggleFog && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Only the lobby leader can change fog settings.
                  </div>
                )}
              </div>
              {forceLobbySelection ? (
                <div className="mt-5 space-y-3">
                  <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Rejoining a match in progress. Pick a slot, then enter the battle.
                  </div>
                  <button
                    onClick={() => setForceLobbySelection(false)}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    ✅ Join Game
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => sendAction('startBattle', { playerID })}
                  disabled={!canStartMatch}
                  className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {playerID === lobbyLeaderId ? (canStartMatch ? '🚀 Start Match' : 'Waiting for players') : 'Waiting for leader'}
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="mb-4 text-sm font-semibold text-red-200">TEAM 2</div>
              {slotConfig.slice(1).map(slot => {
                const occupant = lobbyPlayers[slot.id]
                const isCurrent = slot.id === playerID
                const isOccupied = Boolean(occupant)
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{slot.label}</div>
                      <div className="text-xs text-slate-400">
                        {occupant ? occupant.name : 'Add the player'}
                        {lobbyLeaderId === slot.id && <span className="ml-2 text-amber-300">(Leader)</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => sendAction('claimSlot', { playerID, desiredSlot: slot.id, playerName: playerName || undefined })}
                      className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800"
                    >
                      {isCurrent ? 'Your Slot' : isOccupied ? 'Claim' : 'Join'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const myUnits = gameState?.units?.filter(u => u.ownerID === playerID) || []
  const selectedUnit = gameState?.selectedUnitId
    ? gameState.units.find(u => u.id === gameState.selectedUnitId)
    : null

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
                  <p>⚔️ Swordsman: 2 move, 25 ATK | Archer: 2 move, 30 ATK | Knight: 3 move, 30 ATK | Militia: 2 move, 20 ATK | Catapult: 1 move, 50 ATK | War Galley: 3 move, 30 ATK (naval)</p>
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
                          <div className="font-semibold">
                            {unit.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {unit.description}
                          </div>
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
                onHexHover={setHoveredHex}
                onHexHoverEnd={() => setHoveredHex(null)}
                selectedHex={null}
                highlightedHexes={highlightedHexes}
                attackableHexes={attackableHexes}
                units={visibleUnits}
                hexes={gameState?.hexes || []}
                mapSize={gameState?.mapSize || null}
                terrainMap={gameState?.terrainMap || {}}
                selectedUnitId={gameState?.selectedUnitId || null}
                currentPlayerID={playerID}
                damagePreview={damagePreview}
                showSpawnZones={gameState?.phase === 'setup'}
                isWinter={gameState?.isWinter}
                fogOfWarEnabled={fogActive}
                visibleHexes={visibleHexes}
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
                  <div className="space-y-2">
                    <button
                      onClick={undoMove}
                      disabled={!isMyTurn || !selectedUnit?.lastMove || selectedUnit?.hasAttacked}
                      className="w-full py-2.5 rounded-lg font-bold bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 transition-all"
                    >
                      ↩ Undo Move
                    </button>
                    <button
                      onClick={endTurn}
                      disabled={!isMyTurn}
                      className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 transition-all"
                    >
                      ⏭️ End Turn
                    </button>
                  </div>
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

      <ConfirmDialog
        open={showReadyConfirm}
        title="Deploy no units?"
        description="You have no units deployed. Are you sure you want to start the battle anyway?"
        confirmLabel="Start Battle"
        cancelLabel="Go Back"
        onConfirm={confirmReadyForBattle}
        onCancel={() => setShowReadyConfirm(false)}
      />
    </div>
  )
}
