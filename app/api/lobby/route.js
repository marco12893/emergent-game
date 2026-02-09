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
      const spectators = (game.spectators || []).map((spectator) => ({
        id: spectator.id,
        name: spectator.name || 'Spectator',
        joinTime: spectator.joinTime || null,
      }))

      const playerCount = players.filter(player => player.id !== 'spectator').length
      const status = 'open' // Always show as open to allow anyone to join

      const mapNames = {
        MAP_1: 'Map 1 (Heartland)',
        MAP_2: 'Map 2 (Northern Coast)',
        MAP_3: 'Map 3 (Open Sea)',
      }

      return {
        id: game.id,
        mapId: game.mapId || 'MAP_1',
        mapName: mapNames[game.mapId] || mapNames.MAP_1,
        isWinter: Boolean(game.isWinter),
        teamMode: Boolean(game.teamMode),
        fogOfWarEnabled: Boolean(game.fogOfWarEnabled),
        players,
        spectators,
        playerCount,
        maxPlayers: game.maxPlayers || 2,
        leaderId: game.leaderId || null,
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
