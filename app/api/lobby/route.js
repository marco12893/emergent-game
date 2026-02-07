import { NextResponse } from 'next/server'
import { getGames, cleanupInactiveGames } from '@/lib/gameState'

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
    // Run deterministic cleanup (every 2 minutes guaranteed)
    cleanupInactiveGames().catch(err => {
      console.error('❌ Lobby cleanup failed:', err);
    });

    const games = await getGames()
    const lobbyGames = Object.values(games).map((game) => {
      const players = Object.entries(game.players || {}).map(([id, data]) => ({
        id,
        name: data?.name || `Player ${id}`,
        joined: Boolean(data?.joined),
        joinTime: data?.joinTime || null,
      }))

      const playerCount = players.length
      const status = 'open' // Always show as open to allow anyone to join

      return {
        id: game.id,
        mapId: game.mapId || 'MAP_1',
        mapName: game.mapId === 'MAP_2' ? 'Map 2 (Northern Coast)' : 'Map 1 (Heartland)',
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
