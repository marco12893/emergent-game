import { NextResponse } from 'next/server'
import { getGame, createNewGame, saveGame } from '@/lib/gameState'

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
    
    console.log(`🎮 Join request - Game: ${gameId}, Player: ${playerID}`)
    
    // Check if game exists, create if not
    let game = await getGame(gameId)
    
    if (!game) {
      console.log(`📦 Creating new game: ${gameId}`)
      game = await createNewGame(gameId)
    }
    
    // Add player to game
    game.players[playerID] = { 
      joined: true, 
      joinTime: Date.now(),
      lastSeen: Date.now()
    }
    
    // Save updated game state
    await saveGame(gameId, game)
    
    console.log(`✅ Player ${playerID} joined game ${gameId}`)
    
    return NextResponse.json({ success: true, gameState: game }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error) {
    console.error('❌ Error in /api/join:', error)
    return NextResponse.json({ 
      error: 'Failed to join game',
      message: error.message 
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
