import { NextResponse } from 'next/server'
import { getGame, setGame, createNewGame } from '@/lib/gameState'
import { sanitizeGameId, sanitizeMapId, sanitizePlayerID, sanitizePlayerName, sanitizeWinterFlag, sanitizeTeamModeFlag } from '@/lib/inputSanitization'
import { getTeamPlayOrder } from '@/game/teamUtils'

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
    const { gameId, playerID, playerName, mapId, winter, teamMode } = body
    
    // Sanitize and validate inputs
    const sanitizedGameId = sanitizeGameId(gameId)
    const sanitizedPlayerID = playerID === undefined || playerID === null ? null : sanitizePlayerID(playerID)
    const sanitizedPlayerName = sanitizePlayerName(playerName)
    const sanitizedMapId = sanitizeMapId(mapId)
    const sanitizedWinter = sanitizeWinterFlag(winter)
    const sanitizedTeamMode = sanitizeTeamModeFlag(teamMode)
    
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
      try {
        game = await createNewGame(gameId, sanitizedMapId || undefined, sanitizedWinter, sanitizedTeamMode)
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
    
    const takenPlayers = new Set(Object.keys(game.players || {}))
    const maxPlayers = game.maxPlayers || 2
    let assignedPlayerID = sanitizedPlayerID

    if (!assignedPlayerID) {
      const playOrder = game.teamMode ? getTeamPlayOrder(maxPlayers) : ['0', '1']
      assignedPlayerID = playOrder.find((id) => !takenPlayers.has(id))
    }

    if (!assignedPlayerID) {
      return NextResponse.json({ 
        error: 'Lobby is full.' 
      }, { 
        status: 409,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
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
      : `Player ${assignedPlayerID}`

    if (assignedPlayerID === 'spectator') {
      const spectatorId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      game.spectators = game.spectators || []
      game.spectators.push({
        id: spectatorId,
        name: sanitizedPlayerName || defaultName,
        joinTime: Date.now(),
      })
    } else {
      if (takenPlayers.has(assignedPlayerID)) {
        return NextResponse.json({ 
          error: `Player slot ${assignedPlayerID} is already taken.` 
        }, { 
          status: 409,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        })
      }
      game.players[assignedPlayerID] = {
        name: sanitizedPlayerName || defaultName,
        joinTime: Date.now(),
        joined: true,
      }
      if (!game.leaderId) {
        game.leaderId = assignedPlayerID
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
