import { NextResponse } from 'next/server'
import { getGames, getGame } from '@/lib/gameState'

export async function GET(request) {
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const gameId = pathParts[pathParts.length - 1]
  
  // Health check
  if (gameId === 'health') {
    return NextResponse.json({ status: 'OK', games: Object.keys(getGames()) })
  }
  
  // Get game state
  const game = getGame(gameId)
  if (game) {
    return NextResponse.json(game)
  }
  
  return NextResponse.json({ error: 'Game not found' }, { status: 404 })
}
