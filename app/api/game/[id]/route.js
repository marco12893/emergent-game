import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getGames, getGame, setGame } from '@/lib/gameState'
import { sanitizeGameId } from '@/lib/inputSanitization'
import { advanceTurn, hasTurnTimedOut, setTurnTimerForCurrentPlayer } from '@/lib/turnTimer'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: CORS_HEADERS,
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
      }, { headers: CORS_HEADERS })
    }

    // Validate gameId
    if (!sanitizedGameId || sanitizedGameId === '') {
      return NextResponse.json({
        error: 'Missing or invalid gameId parameter'
      }, {
        status: 400,
        headers: CORS_HEADERS,
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
        headers: CORS_HEADERS,
      })
    }

    if (game) {
      if (game.phase === 'battle') {
        let changed = false
        if (!game.turnStartedAt || !game.turnTimeLimitSeconds) {
          setTurnTimerForCurrentPlayer(game)
          changed = true
        }

        if (hasTurnTimedOut(game)) {
          const timedOutPlayer = game.currentPlayer
          advanceTurn({ game, endingPlayerID: timedOutPlayer, forcedByTimer: true })
          changed = true
        }

        if (changed) {
          await setGame(sanitizedGameId, game)
        }
      }

      return NextResponse.json(game, { headers: CORS_HEADERS })
    }

    const disbandNotice = await kv.get(`disbanded:${sanitizedGameId}`)
    if (disbandNotice) {
      return NextResponse.json({
        error: 'Game disbanded',
        gameId: id,
        disbanded: true,
        message: disbandNotice.message || 'This game has been disbanded by the lobby leader.',
      }, {
        status: 410,
        headers: CORS_HEADERS,
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
        headers: CORS_HEADERS,
      })
    } catch (listError) {
      console.error('❌ KV getGames failed:', listError)
      return NextResponse.json({
        error: 'Game not found and unable to list available games',
        gameId: id,
        details: 'KV service temporarily unavailable'
      }, {
        status: 503,
        headers: CORS_HEADERS,
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
      headers: CORS_HEADERS,
    })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params
    const sanitizedGameId = sanitizeGameId(id)

    if (!sanitizedGameId) {
      return NextResponse.json({ error: 'Missing or invalid gameId parameter' }, { status: 400, headers: CORS_HEADERS })
    }

    const body = await request.json().catch(() => ({}))
    const requesterId = typeof body?.playerID === 'string' ? body.playerID : ''
    const game = await getGame(sanitizedGameId)

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!requesterId || requesterId !== game.leaderId) {
      return NextResponse.json({ error: 'Only the lobby leader can disband this game.' }, { status: 403, headers: CORS_HEADERS })
    }

    await kv.set(`disbanded:${sanitizedGameId}`, {
      gameId: sanitizedGameId,
      disbandedAt: Date.now(),
      message: 'This game has been disbanded by the lobby leader.',
    }, { ex: 300 })
    await kv.del(`game:${sanitizedGameId}`)

    return NextResponse.json({
      success: true,
      disbanded: true,
      gameId: sanitizedGameId,
      message: 'You disbanded this game.',
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('❌ Game DELETE route error:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500, headers: CORS_HEADERS })
  }
}
