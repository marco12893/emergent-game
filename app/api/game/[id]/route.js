import { NextResponse } from 'next/server'
import { getGames, getGame } from '@/lib/gameState'
import { sanitizeGameId } from '@/lib/inputSanitization'

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(request, { params }) {
  try {
    const { id } = params // Extract game ID from dynamic route params
    
    // Sanitize game ID
    const sanitizedGameId = sanitizeGameId(id)
    
    console.log('🔍 Game route called for gameId:', sanitizedGameId)
    
    // Health check
    if (sanitizedGameId === 'health') {
      const games = await getGames()
      return NextResponse.json({ 
        status: 'OK', 
        games: Object.keys(games),
        timestamp: Date.now(),
        message: 'KV service is healthy'
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Validate gameId
    if (!sanitizedGameId || sanitizedGameId === '') {
      return NextResponse.json({ 
        error: 'Missing or invalid gameId parameter' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Get game state
    let game
    try {
      game = await getGame(sanitizedGameId)
      console.log('🎮 Found game:', game ? 'YES' : 'NO')
    } catch (kvError) {
      console.error('❌ KV getGame failed:', kvError)
      return NextResponse.json({ 
        error: 'Database error: Unable to retrieve game',
        details: 'KV service temporarily unavailable',
        gameId: sanitizedGameId
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    if (game) {
      return NextResponse.json(game, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Game not found - try to get available games for better error message
    try {
      const games = await getGames()
      return NextResponse.json({ 
        error: 'Game not found', 
        gameId: id, 
        availableGames: Object.keys(games),
        message: `Game '${id}' does not exist. Available games: ${Object.keys(games).join(', ') || 'none'}`
      }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    } catch (listError) {
      console.error('❌ KV getGames failed:', listError)
      return NextResponse.json({ 
        error: 'Game not found and unable to list available games',
        gameId: id,
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
  } catch (error) {
    console.error('❌ Game route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      timestamp: Date.now()
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}
