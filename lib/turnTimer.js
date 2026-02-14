import { getTeamId, getTeamLabel, getTeamPlayOrder } from '@/game/teamUtils'
import { updateMap4ObjectiveState } from '@/game/map4Objectives'

export const calculateTurnTimeLimitSeconds = unitCount => {
  const normalizedCount = Math.max(0, Number(unitCount) || 0)
  if (normalizedCount < 5) return (normalizedCount + 1) * 10
  return normalizedCount * 10
}

export const getGamePlayOrder = game => {
  const teamMode = Boolean(game.teamMode)
  const maxPlayers = game.maxPlayers || (teamMode ? 4 : 2)
  return teamMode ? getTeamPlayOrder(maxPlayers) : ['0', '1']
}

const getAliveUnitCountForPlayer = (game, playerID) => {
  return (game.units || []).filter(unit => unit.ownerID === playerID && unit.currentHP > 0).length
}

export const setTurnTimerForCurrentPlayer = game => {
  if (!game || game.phase !== 'battle') {
    game.turnStartedAt = null
    game.turnTimeLimitSeconds = null
    return
  }

  const unitCount = getAliveUnitCountForPlayer(game, game.currentPlayer)
  game.turnStartedAt = Date.now()
  game.turnTimeLimitSeconds = calculateTurnTimeLimitSeconds(unitCount)
}

export const hasTurnTimedOut = (game, now = Date.now()) => {
  if (!game || game.phase !== 'battle') return false
  const turnStartedAt = Number(game.turnStartedAt)
  const turnTimeLimitSeconds = Number(game.turnTimeLimitSeconds)

  if (!Number.isFinite(turnStartedAt) || !Number.isFinite(turnTimeLimitSeconds) || turnTimeLimitSeconds <= 0) {
    return false
  }
  return now >= turnStartedAt + (turnTimeLimitSeconds * 1000)
}

export const advanceTurn = ({ game, endingPlayerID, forcedByTimer = false }) => {
  const teamMode = Boolean(game.teamMode)
  const playOrder = getGamePlayOrder(game)
  const setupPlayers = playOrder.filter(id => game.players?.[id])
  const activePlayers = game.phase === 'setup'
    ? setupPlayers
    : playOrder.filter(id =>
      game.units.some(unit => unit.ownerID === id && unit.currentHP > 0)
    )

  if (teamMode) {
    game.inactivePlayers = playOrder.filter(id => !activePlayers.includes(id))
  }

  const effectiveOrder = activePlayers.length > 0 ? activePlayers : playOrder
  const currentIndex = Math.max(0, effectiveOrder.indexOf(game.currentPlayer))
  const nextIndex = (currentIndex + 1) % effectiveOrder.length
  const nextPlayer = effectiveOrder[nextIndex]
  const roundStartPlayer = effectiveOrder[0]

  if (game.currentPlayer === effectiveOrder[effectiveOrder.length - 1] && endingPlayerID === game.currentPlayer) {
    if (game.turn === undefined) {
      game.turn = 1
    } else {
      game.turn += 1
    }
    game.log.push(`=== Turn ${game.turn} ===`)

    if (game.gameMode === 'ATTACK_DEFEND') {
      const aliveUnits = game.units.filter(u => u.currentHP > 0)
      let attackerControls = 0
      let defenderControls = 0

      game.objectiveHexes.forEach(objHex => {
        const unitOnHex = aliveUnits.find(u => u.q === objHex.q && u.r === objHex.r)
        if (unitOnHex) {
          const teamId = teamMode ? getTeamId(unitOnHex.ownerID) : unitOnHex.ownerID
          if (teamId === game.attackerId) attackerControls += 1
          if (teamId === game.defenderId) defenderControls += 1
        }
      })

      if (attackerControls === game.objectiveHexes.length) {
        game.objectiveControl[game.attackerId] += 1
        game.log.push(`${getTeamLabel(game.attackerId)} holds Paris! (${game.objectiveControl[game.attackerId]} turns)`)
      } else if (defenderControls === game.objectiveHexes.length) {
        game.objectiveControl[game.defenderId] += 1
        game.log.push(`${getTeamLabel(game.defenderId)} holds Paris! (${game.objectiveControl[game.defenderId]} turns)`)
      } else {
        game.log.push('Paris is contested!')
      }
    }

    if (game.map4ObjectiveState?.enabled) {
      updateMap4ObjectiveState({ G: game, teamMode })
    }
  }

  game.currentPlayer = nextPlayer || roundStartPlayer
  game.units.forEach(unit => {
    unit.hasMoved = false
    unit.hasAttacked = false
    unit.movePoints = unit.maxMovePoints
    unit.hasMovedOrAttacked = false
    unit.lastMove = null
  })
  game.selectedUnitId = null

  if (forcedByTimer) {
    game.log.push(`⏱️ Player ${endingPlayerID} ran out of time. Turn forced to Player ${game.currentPlayer}.`)
  } else {
    game.log.push(`Player ${endingPlayerID} ended turn. Player ${game.currentPlayer}'s turn begins.`)
  }

  setTurnTimerForCurrentPlayer(game)
  game.lastUpdate = Date.now()
}
