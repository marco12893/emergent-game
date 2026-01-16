import { kv } from '@vercel/kv'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    // Root endpoint - GET /api/root or /api/
    if ((route === '/root' || route === '/') && method === 'GET') {
      return handleCORS(NextResponse.json({ 
        message: "Emergent Game API - KV Powered",
        status: "healthy",
        timestamp: new Date().toISOString(),
        endpoints: {
          join: "POST /api/join",
          action: "POST /api/action", 
          game: "GET /api/game/:id",
          health: "GET /api/game/health"
        }
      }))
    }

    // Status endpoints - POST /api/status
    if (route === '/status' && method === 'POST') {
      const body = await request.json()
      
      if (!body.client_name) {
        return handleCORS(NextResponse.json(
          { error: "client_name is required" }, 
          { status: 400 }
        ))
      }

      const statusObj = {
        id: uuidv4(),
        client_name: body.client_name,
        timestamp: new Date().toISOString()
      }

      // Store in KV with 24 hour TTL
      await kv.set(`status:${statusObj.id}`, statusObj, { ex: 86400 })
      return handleCORS(NextResponse.json(statusObj))
    }

    // Status endpoints - GET /api/status
    if (route === '/status' && method === 'GET') {
      try {
        const statusKeys = await kv.keys('status:*')
        const statusChecks = []
        
        for (const key of statusKeys) {
          const status = await kv.get(key)
          if (status) {
            statusChecks.push(status)
          }
        }

        // Sort by timestamp (newest first)
        statusChecks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        
        return handleCORS(NextResponse.json(statusChecks.slice(0, 1000))) // Limit to 1000
      } catch (kvError) {
        console.error('KV error fetching status:', kvError)
        return handleCORS(NextResponse.json(
          { error: "Failed to retrieve status checks" }, 
          { status: 503 }
        ))
      }
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { 
        error: `Route ${route} not found`,
        availableRoutes: [
          "GET /api/",
          "GET /api/root", 
          "POST /api/status",
          "GET /api/status",
          "POST /api/join",
          "POST /api/action",
          "GET /api/game/:id",
          "GET /api/game/health"
        ]
      }, 
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { 
        error: "Internal server error",
        details: error.message,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute