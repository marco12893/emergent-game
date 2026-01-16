import { NextResponse } from 'next/server'
import { getGame, setGame, createNewGame } from '@/lib/gameState'

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
    const { gameId, playerID } = body
    
    console.log(`🎮 Player ${playerID} trying to join game ${gameId}`)
    
    // Validate input
    if (!gameId || playerID === undefined) {
      return NextResponse.json({ 
        error: 'Missing required fields: gameId and playerID' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    let game
    try {
      game = await getGame(gameId)
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
    
    // Add player to game
    game.players[playerID] = { joined: true, joinTime: Date.now() }
    
    // Save updated game state
    try {
      await setGame(gameId, game)
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
    
    console.log(`✅ Player ${playerID} joined game ${gameId}`)
    
    return NextResponse.json({ 
      success: true, 
      gameState: game,
      message: `Player ${playerID} joined successfully`
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
