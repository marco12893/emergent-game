import { NextResponse } from 'next/server'
import { getGame, createNewGame } from '@/lib/gameState'

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
  // Add CORS headers
  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  
  const body = await request.json()
  const { gameId, playerID } = body
  
  if (!getGame(gameId)) {
    createNewGame(gameId)
  }
  
  const game = getGame(gameId)
  game.players[playerID] = { joined: true, joinTime: Date.now() }
  
  console.log(`🎮 Player ${playerID} joined game ${gameId}`)
  
  return NextResponse.json({ success: true, gameState: game }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
