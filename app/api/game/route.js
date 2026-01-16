import { NextResponse } from 'next/server'

export async function GET(request) {
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const gameId = pathParts[pathParts.length - 1]
  
  console.log('🔍 Game route called for gameId:', gameId)
  
  return NextResponse.json({ 
    message: 'Game route is working!',
    gameId: gameId,
    timestamp: Date.now()
  })
}

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
