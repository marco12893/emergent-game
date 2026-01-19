'use client'

import React from 'react'

const VictoryScreen = ({ 
  gameOver, 
  winner, 
  victoryData, 
  onClose,
  playerID,
  units = []
}) => {
  if (!gameOver) return null

  const isWinner = winner === playerID
  const isDraw = victoryData?.draw
  const victoryType = victoryData?.victoryType || 'elimination'
  const turn = victoryData?.turn || 1
  const message = victoryData?.message || ''

  const getVictoryEmoji = (type) => {
    switch (type) {
      case 'elimination': return '⚔️'
      case 'turn_limit': return '⏰'
      case 'mutual_destruction': return '💥'
      case 'turn_limit_draw': return '🤝'
      default: return '🏆'
    }
  }

  const getVictoryTitle = () => {
    if (isDraw) return 'Draw!'
    if (isWinner) return 'Victory!'
    return 'Defeat!'
  }

  const getVictoryColor = () => {
    if (isDraw) return 'from-yellow-600 to-orange-600'
    if (isWinner) return 'from-green-600 to-emerald-600'
    return 'from-red-600 to-rose-600'
  }

  // Group units by player
  const player0Units = units.filter(u => u.ownerID === '0' && u.currentHP > 0)
  const player1Units = units.filter(u => u.ownerID === '1' && u.currentHP > 0)

  const UnitList = ({ playerUnits, playerNumber, label }) => (
    <div className={`p-3 rounded-lg border ${
      playerNumber === '0' 
        ? isWinner && winner === '0' && !isDraw
          ? 'bg-blue-600/20 border-blue-500' 
          : isDraw 
          ? 'bg-yellow-600/20 border-yellow-500'
          : 'bg-red-600/20 border-red-500'
        : isWinner && winner === '1' && !isDraw
          ? 'bg-red-600/20 border-red-500'
          : isDraw 
          ? 'bg-yellow-600/20 border-yellow-500'
          : 'bg-blue-600/20 border-blue-500'
    }`}>
      <div className="text-sm font-semibold text-slate-300 mb-2">
        {label} ({playerUnits.length} units)
      </div>
      {playerUnits.length === 0 ? (
        <div className="text-xs text-slate-500 italic">No units remaining</div>
      ) : (
        <div className="space-y-1">
          {playerUnits.map(unit => (
            <div key={unit.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <img 
                  src={`/units/${unit.image}_${unit.ownerID === '0' ? 'blue' : 'red'}.png`}
                  className="w-4 h-4"
                  alt={unit.name}
                />
                <span className="text-slate-300">{unit.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 bg-slate-700 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full ${
                      (unit.currentHP / unit.maxHP) > 0.5 ? 'bg-green-500' :
                      (unit.currentHP / unit.maxHP) > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(unit.currentHP / unit.maxHP) * 100}%` }}
                  />
                </div>
                <span className="text-slate-400 text-xs">
                  {unit.currentHP}/{unit.maxHP}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border-2 border-slate-600 p-6 max-w-2xl w-full mx-4 shadow-2xl relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
        >
          ×
        </button>
        
        {/* Victory Header */}
        <div className={`text-center mb-4 bg-gradient-to-r ${getVictoryColor()} bg-clip-text text-transparent`}>
          <div className="text-5xl mb-2">
            {getVictoryEmoji(victoryType)}
          </div>
          <h1 className="text-3xl font-bold">
            {getVictoryTitle()}
          </h1>
        </div>

        {/* Game Details */}
        <div className="bg-slate-800/50 rounded-lg p-3 mb-4 border border-slate-700">
          <div className="text-center space-y-1">
            <div className="text-xl font-semibold text-white">
              {isDraw ? 'Both Players' : `Player ${winner}`}
            </div>
            <div className="text-slate-300 text-sm">
              {message}
            </div>
            <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
              <span>🎮 Turn {turn}</span>
              <span>•</span>
              <span>{victoryType.replace('_', ' ').toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Remaining Units */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-amber-400 mb-3 text-center">⚔️ Remaining Forces</h3>
          <div className="grid grid-cols-2 gap-3">
            <UnitList 
              playerUnits={player0Units} 
              playerNumber="0" 
              label="Player 0 (Blue)"
            />
            <UnitList 
              playerUnits={player1Units} 
              playerNumber="1" 
              label="Player 1 (Red)"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-lg transition-all"
          >
            🏠 Main Menu
          </button>
        </div>

        {/* Victory Stats */}
        <div className="mt-4 pt-3 border-t border-slate-700">
          <div className="text-center text-xs text-slate-500">
            <div>Game completed in {turn} turns</div>
            <div>Victory type: {victoryType.replace('_', ' ').toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VictoryScreen
