'use client'

import React, { useState, useEffect } from 'react'
import io from 'socket.io-client'
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
    </div>
  )
}

export default function SimpleMultiplayerPage() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [gameState, setGameState] = useState(null)
  const [playerID, setPlayerID] = useState('')
  const [matchID, setMatchID] = useState('')
  const [joined, setJoined] = useState(false)
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')

  useEffect(() => {
    // Clean up socket on unmount
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [socket])

  const connectToGame = () => {
    if (!playerID || !matchID) {
      alert('Please enter Player ID and Match ID')
      return
    }

    const newSocket = io('http://localhost:8000', {
      transports: ['websocket', 'polling'] // Try both transport methods
    })
    
    newSocket.on('connect', () => {
      setConnected(true)
      setSocket(newSocket)
      
      // Join the game
      newSocket.emit('joinGame', { gameId: matchID, playerID })
    })

    newSocket.on('disconnect', () => {
      setConnected(false)
      setJoined(false)
    })

    newSocket.on('gameState', (state) => {
      setGameState(state)
      setJoined(true)
    })

    newSocket.on('playerJoined', (data) => {
      // Player joined notification
    })

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error)
      alert('Failed to connect to game server. Make sure server is running on localhost:8000')
    })
  }

  const handleHexClick = (hex) => {
    if (!socket || !joined || !gameState) return

    // Check if it's the current player's turn
    if (gameState.currentPlayer !== playerID) {
      alert('Not your turn!')
      return
    }

    // Check if clicking on existing unit
    const existingUnit = gameState.units.find(u => u.q === hex.q && u.r === hex.r)
    
    if (existingUnit) {
      if (existingUnit.ownerID === playerID) {
        // Remove own unit
        socket.emit('gameAction', {
          gameId: matchID,
          action: 'removeUnit',
          payload: { unitId: existingUnit.id, playerID }
        })
      }
      return
    }

    // Try to place a new unit
    const isSpawnZone = playerID === '0' ? hex.q <= -5 : hex.q >= 4
    if (isSpawnZone) {
      socket.emit('gameAction', {
        gameId: matchID,
        action: 'placeUnit',
        payload: {
          unitType: selectedUnitType,
          q: hex.q,
          r: hex.r,
          playerID
        }
      })
    }
  }

  const endTurn = () => {
    if (!socket || !joined) return
    
    socket.emit('gameAction', {
      gameId: matchID,
      action: 'endTurn',
      payload: { playerID }
    })
  }

  const readyForBattle = () => {
    if (!socket || !joined) return
    
    socket.emit('gameAction', {
      gameId: matchID,
      action: 'readyForBattle',
      payload: { playerID }
    })
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-amber-400 mb-6 text-center">
            ⚔️ Join Multiplayer Battle
          </h1>
          
          {connected ? (
            <div className="text-green-400 text-center mb-4">
              ✅ Connected to server
            </div>
          ) : (
            <div className="text-yellow-400 text-center mb-4">
              🔌 Not connected
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
              disabled={!playerID || !matchID}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white font-bold rounded-lg transition-all"
            >
              🎮 Connect & Join Battle
            </button>
          </div>
          
          <div className="mt-6 text-xs text-slate-400">
            <p>💡 Make sure the game server is running on localhost:8000</p>
            <p>🌐 Two players need same Match ID to play together</p>
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
            ⚔️ Medieval Battle - Multiplayer
          </h1>
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded ${playerID === '0' ? 'bg-blue-600' : 'bg-red-600'}`}>
              Player {playerID}
            </div>
            <div className="text-sm text-slate-400">
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
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

      {/* Main Game Area */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Left Panel - Unit Selection & Info */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Unit Selection */}
            <div className="bg-slate-800/80 rounded-lg border border-slate-700 p-4">
              <h2 className="text-lg font-semibold text-amber-400 mb-3">🎖️ Place Units</h2>
              
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
                highlightedHexes={[]}
                attackableHexes={[]}
                units={gameState?.units || []}
                hexes={gameState?.hexes || []}
                terrainMap={gameState?.terrainMap || {}}
                mapConfig={gameState?.mapConfig || null}
                selectedUnitId={null}
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
