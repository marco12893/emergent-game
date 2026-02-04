import { NextResponse } from 'next/server'
import { getGames } from '@/lib/gameState'

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

export async function GET() {
  try {
    const games = await getGames()
    const lobbyGames = Object.values(games).map((game) => {
      const players = Object.entries(game.players || {}).map(([id, data]) => ({
        id,
        name: data?.name || `Player ${id}`,
        joined: Boolean(data?.joined),
        joinTime: data?.joinTime || null,
      }))

      const playerCount = players.length
      const status = playerCount >= 2 ? 'full' : playerCount === 1 ? 'waiting' : 'open'

      return {
        id: game.id,
        mapId: game.mapId || 'MAP_1',
        mapName: game.mapConfig?.name || 'Map 1 (Original)',
        players,
        playerCount,
        status,
        lastUpdate: game.lastUpdate || null,
      }
    })

    lobbyGames.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0))

    return NextResponse.json({ games: lobbyGames }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error) {
    console.error('❌ Lobby route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
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
