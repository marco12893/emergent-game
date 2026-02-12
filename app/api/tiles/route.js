import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TILE_ROOT = path.join(process.cwd(), 'public', 'tiles')

const walk = async (dir, prefix = '/tiles') => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const output = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const webPath = `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      output.push(...await walk(fullPath, webPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) continue
    output.push(webPath)
  }

  return output
}

export async function GET() {
  try {
    const tiles = await walk(TILE_ROOT)
    return NextResponse.json(
      { tiles: tiles.sort() },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load tile textures', details: error.message }, { status: 500 })
  }
}
