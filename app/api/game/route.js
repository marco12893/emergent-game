import { NextResponse } from 'next/server'
import { getGames, getGame } from '@/lib/gameState'

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

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const gameId = pathParts[pathParts.length - 1]
    
    console.log('🔍 Game route called for gameId:', gameId)
    
    // Health check
    if (gameId === 'health') {
      try {
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
      } catch (healthError) {
        console.error('❌ Health check failed:', healthError)
        return NextResponse.json({ 
          status: 'ERROR', 
          error: 'KV service unavailable',
          timestamp: Date.now()
        }, { 
          status: 503,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        })
      }
    }
    
    // Validate gameId
    if (!gameId || gameId === '') {
      return NextResponse.json({ 
        error: 'Missing gameId parameter' 
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
      game = await getGame(gameId)
      console.log('🎮 Found game:', game ? 'YES' : 'NO')
    } catch (kvError) {
      console.error('❌ KV getGame failed:', kvError)
      return NextResponse.json({ 
        error: 'Database error: Unable to retrieve game',
        details: 'KV service temporarily unavailable',
        gameId: gameId
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
        gameId: gameId, 
        availableGames: Object.keys(games),
        message: `Game '${gameId}' does not exist. Available games: ${Object.keys(games).join(', ') || 'none'}`
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
        gameId: gameId,
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
