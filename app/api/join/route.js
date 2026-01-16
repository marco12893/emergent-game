import { NextResponse } from 'next/server'
import { getGame, createNewGame } from '@/lib/gameState'

export async function POST(request) {
  const body = await request.json()
  const { gameId, playerID } = body
  
  if (!getGame(gameId)) {
    createNewGame(gameId)
  }
  
  const game = getGame(gameId)
  game.players[playerID] = { joined: true, joinTime: Date.now() }
  
  console.log(`🎮 Player ${playerID} joined game ${gameId}`)
  
  return NextResponse.json({ success: true, gameState: game })
}
