import { NextRequest, NextResponse } from 'next/server'

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8787'
const ADMIN_KEY = process.env.ENGINE_ADMIN_KEY

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
  }

  const { path } = await params
  const target = `${ENGINE_URL}/${path.join('/')}`

  const body = await req.text()

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ENGINE-ADMIN-KEY': ADMIN_KEY,
      },
      body,
    })

    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `engine unreachable: ${msg}` }, { status: 502 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
  }

  const { path } = await params
  const target = `${ENGINE_URL}/${path.join('/')}`

  try {
    const res = await fetch(target, {
      method: 'DELETE',
      headers: { 'X-ENGINE-ADMIN-KEY': ADMIN_KEY },
    })

    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `engine unreachable: ${msg}` }, { status: 502 })
  }
}
