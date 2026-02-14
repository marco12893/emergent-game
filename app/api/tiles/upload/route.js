import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'

const TILE_DIR = path.join(process.cwd(), 'public', 'tiles', 'custom')
const ALLOWED_TYPES = new Set(['image/png'])

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only PNG images are allowed' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const safeName = (file.name || 'custom_hex').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.(png)$/i, '')
    const outputName = `${safeName}_${Date.now()}.png`

    await fs.mkdir(TILE_DIR, { recursive: true })
    await fs.writeFile(path.join(TILE_DIR, outputName), buffer)

    return NextResponse.json({ tilePath: `/tiles/custom/${outputName}` })
  } catch {
    return NextResponse.json({ error: 'Failed to save tile' }, { status: 500 })
  }
}
