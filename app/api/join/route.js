import { NextResponse } from 'next/server'
import { getGame, setGame, createNewGame } from '@/lib/gameState'
import { parseImportedCustomMap } from '@/lib/customMap'
import { sanitizeGameId, sanitizeMapId, sanitizePlayerID, sanitizePlayerName, sanitizeWinterFlag, sanitizeTeamModeFlag } from '@/lib/inputSanitization'
import { getTeamPlayOrder } from '@/game/teamUtils'

const getPlayOrder = (game) => (game.teamMode ? getTeamPlayOrder(game.maxPlayers || 4) : ['0', '1'])

const findParticipantRole = (game, participantID) => {
  if (!participantID) return null
  const playerSlot = Object.keys(game.players || {}).find(
    (slotId) => game.players?.[slotId]?.participantID === participantID
  )
  if (playerSlot) return { role: 'player', slot: playerSlot }
  if ((game.spectators || []).some((spectator) => spectator.id === participantID)) return { role: 'spectator' }
  if ((game.waitlist || []).some((entry) => entry.id === participantID)) return { role: 'waitlist' }
  return null
}

const removeParticipantEverywhere = (game, participantID) => {
  if (!participantID) return null
  let removed = null

  Object.entries(game.players || {}).forEach(([slotId, entry]) => {
    if (entry?.participantID === participantID) {
      removed = { name: entry.name, from: 'player', slotId }
      delete game.players[slotId]
    }
  })

  const spectatorIndex = (game.spectators || []).findIndex((spectator) => spectator.id === participantID)
  if (spectatorIndex !== -1) {
    const [entry] = game.spectators.splice(spectatorIndex, 1)
    removed = { name: entry?.name, from: 'spectator' }
  }

  const waitlistIndex = (game.waitlist || []).findIndex((entry) => entry.id === participantID)
  if (waitlistIndex !== -1) {
    const [entry] = game.waitlist.splice(waitlistIndex, 1)
    removed = { name: entry?.name, from: 'waitlist' }
  }

  return removed
}

const assignParticipantToRole = ({ game, participantID, desiredRole, desiredSlot, participantName }) => {
  const existing = removeParticipantEverywhere(game, participantID)
  const joinTime = Date.now()
  const name = participantName || existing?.name || 'Player'

  if (desiredRole === 'spectator') {
    game.spectators = game.spectators || []
    game.spectators.push({ id: participantID, name, joinTime })
    return 'spectator'
  }

  if (desiredRole === 'waitlist') {
    game.waitlist = game.waitlist || []
    game.waitlist.push({ id: participantID, name, joinTime })
    return 'waitlist'
  }

  if (desiredSlot) {
    game.players[desiredSlot] = {
      name,
      joinTime: existing?.from === 'player' ? game.players?.[desiredSlot]?.joinTime || joinTime : joinTime,
      joined: true,
      participantID,
    }
    if (!game.leaderId) {
      game.leaderId = desiredSlot
    }
    return desiredSlot
  }

  return 'waitlist'
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { gameId, playerID, playerName, mapId, winter, teamMode, customMap, participantID: requestedParticipantID } = body
    
    // Sanitize and validate inputs
    const sanitizedGameId = sanitizeGameId(gameId)
    const sanitizedPlayerID = playerID === undefined || playerID === null ? null : sanitizePlayerID(playerID)
    const sanitizedPlayerName = sanitizePlayerName(playerName)
    const sanitizedMapId = sanitizeMapId(mapId)
    const sanitizedWinter = sanitizeWinterFlag(winter)
    const sanitizedTeamMode = sanitizeTeamModeFlag(teamMode)
    const sanitizedCustomMap = sanitizedMapId === 'CUSTOM' ? parseImportedCustomMap(customMap) : null
    
    if (!sanitizedGameId || (playerID !== undefined && sanitizedPlayerID === null)) {
      return NextResponse.json({ 
        error: 'Invalid or missing required fields: gameId or playerID' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    console.log(`🎮 Player ${sanitizedPlayerID ?? 'auto'} trying to join game ${sanitizedGameId}`)
    
    let game
    try {
      game = await getGame(sanitizedGameId)
    } catch (kvError) {
      console.error('❌ KV getGame failed:', kvError)
      return NextResponse.json({ 
        error: 'Database error: Unable to retrieve game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    if (!game) {
      console.log('🆕 Creating new game')
      if (sanitizedMapId === 'CUSTOM' && !sanitizedCustomMap) {
        return NextResponse.json({
          error: 'Invalid custom map JSON. Please export/import a valid custom map file.'
        }, {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        })
      }
      try {
        game = await createNewGame(
          sanitizedGameId,
          sanitizedMapId || undefined,
          sanitizedWinter,
          sanitizedTeamMode,
          sanitizedCustomMap
        )
      } catch (createError) {
        console.error('❌ KV createGame failed:', createError)
        return NextResponse.json({ 
          error: 'Database error: Unable to create game',
          details: 'KV service temporarily unavailable'
        }, { 
          status: 503,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        })
      }
    }
    
    game.waitlist = game.waitlist || []
    const existingRole = findParticipantRole(game, requestedParticipantID)
    const maxPlayers = game.maxPlayers || 2
    let assignedPlayerID = sanitizedPlayerID
    const participantID = requestedParticipantID || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    if (existingRole) {
      if (existingRole.role === 'player') {
        assignedPlayerID = existingRole.slot
      } else {
        assignedPlayerID = existingRole.role
      }

      if (existingRole.role === 'player' && game.players?.[existingRole.slot]) {
        game.players[existingRole.slot].name = sanitizedPlayerName || game.players[existingRole.slot].name
      } else if (existingRole.role === 'spectator') {
        game.spectators = (game.spectators || []).map((spectator) => (
          spectator.id === participantID
            ? { ...spectator, name: sanitizedPlayerName || spectator.name }
            : spectator
        ))
      } else if (existingRole.role === 'waitlist') {
        game.waitlist = (game.waitlist || []).map((entry) => (
          entry.id === participantID
            ? { ...entry, name: sanitizedPlayerName || entry.name }
            : entry
        ))
      }
    } else {
      const playOrder = getPlayOrder(game)
      const openSlot = playOrder.find((slotId) => !game.players?.[slotId])

      if (assignedPlayerID === 'spectator') {
        assignedPlayerID = assignParticipantToRole({
          game,
          participantID,
          desiredRole: 'spectator',
          participantName: sanitizedPlayerName || 'Spectator',
        })
      } else if (assignedPlayerID && assignedPlayerID !== 'spectator') {
        const desiredSlotId = String(assignedPlayerID)
        const slotAvailable = !game.players?.[desiredSlotId] || game.players?.[desiredSlotId]?.participantID === participantID
        assignedPlayerID = assignParticipantToRole({
          game,
          participantID,
          desiredRole: slotAvailable ? 'player' : 'waitlist',
          desiredSlot: slotAvailable ? desiredSlotId : null,
          participantName: sanitizedPlayerName || `Player ${desiredSlotId}`,
        })
      } else if (openSlot) {
        assignedPlayerID = assignParticipantToRole({
          game,
          participantID,
          desiredRole: 'player',
          desiredSlot: openSlot,
          participantName: sanitizedPlayerName || `Player ${openSlot}`,
        })
      } else {
        assignedPlayerID = assignParticipantToRole({
          game,
          participantID,
          desiredRole: 'waitlist',
          participantName: sanitizedPlayerName || 'Waitlisted player',
        })
      }
    }

    if (assignedPlayerID !== 'spectator' && Number(assignedPlayerID) >= maxPlayers) {
      return NextResponse.json({ 
        error: `Player slot ${assignedPlayerID} is not available for this lobby.` 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    // Always allow joining - no restrictions
    const defaultName = assignedPlayerID === 'spectator'
      ? 'Spectator'
      : assignedPlayerID === 'waitlist'
        ? 'Waitlisted player'
        : `Player ${assignedPlayerID}`

    if (assignedPlayerID === 'waitlist') {
      game.waitlist = game.waitlist || []
      const hasEntry = game.waitlist.some((entry) => entry.id === participantID)
      if (!hasEntry) {
        game.waitlist.push({ id: participantID, name: sanitizedPlayerName || defaultName, joinTime: Date.now() })
      }
    }
    
    // Save updated game state
    try {
      await setGame(sanitizedGameId, game)
    } catch (saveError) {
      console.error('❌ KV setGame failed:', saveError)
      return NextResponse.json({ 
        error: 'Database error: Unable to save game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    console.log(`✅ Player ${assignedPlayerID} joined game ${gameId}`)
    
    return NextResponse.json({ 
      success: true, 
      gameState: game,
      playerID: assignedPlayerID,
      participantID,
      message: `Player ${assignedPlayerID} joined successfully`
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
    
  } catch (error) {
    console.error('❌ Join route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}
