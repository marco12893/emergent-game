import { NextResponse } from 'next/server'
import { getGame, setGame, createNewGame } from '@/lib/gameState'
import { sanitizeGameId, sanitizePlayerID, sanitizePlayerName } from '@/lib/inputSanitization'

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
    const { gameId, playerID, playerName } = body
    
    // Sanitize and validate inputs
    const sanitizedGameId = sanitizeGameId(gameId)
    const sanitizedPlayerID = playerID === undefined || playerID === null ? null : sanitizePlayerID(playerID)
    const sanitizedPlayerName = sanitizePlayerName(playerName)
    
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
        game = await createNewGame(gameId)
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
    let assignedPlayerID = sanitizedPlayerID

    if (!assignedPlayerID) {
      assignedPlayerID = ['0', '1'].find((id) => !takenPlayers.has(id))
    }

    if (!assignedPlayerID) {
      return NextResponse.json({ 
        error: 'Game is full',
        gameId: sanitizedGameId
      }, { 
        status: 409,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    if (game.players[assignedPlayerID]) {
      return NextResponse.json({ 
        error: 'Player slot already taken',
        gameId: sanitizedGameId,
        playerID: assignedPlayerID
      }, { 
        status: 409,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    // Add player to game
    game.players[assignedPlayerID] = { 
      joined: true, 
      joinTime: Date.now(),
      name: sanitizedPlayerName || `Player ${assignedPlayerID}`
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
