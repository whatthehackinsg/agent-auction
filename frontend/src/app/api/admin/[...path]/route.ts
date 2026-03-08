import { NextRequest, NextResponse } from 'next/server'

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8787'
const ADMIN_KEY = process.env.ENGINE_ADMIN_KEY

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!ADMIN_KEY) {
      return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
    }

    const { path } = await params
    const url = new URL(req.url)
    const qs = url.search // preserve query string
    const target = `${ENGINE_URL}/${path.join('/')}${qs}`

    const res = await fetch(target, {
      method: 'GET',
      headers: { 'X-ENGINE-ADMIN-KEY': ADMIN_KEY },
    })

    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-proxy] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!ADMIN_KEY) {
      return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
    }

    const { path } = await params
    const target = `${ENGINE_URL}/${path.join('/')}`

    const contentType = req.headers.get('Content-Type') ?? 'application/json'
    const isMultipart = contentType.includes('multipart/form-data')

    // For multipart, forward the raw body so the engine can parse the form
    const body = isMultipart ? await req.arrayBuffer() : await req.text()

    const headers: Record<string, string> = {
      'X-ENGINE-ADMIN-KEY': ADMIN_KEY,
    }
    // Let fetch set Content-Type with boundary for multipart; set explicitly otherwise
    if (!isMultipart) {
      headers['Content-Type'] = contentType
    } else {
      headers['Content-Type'] = contentType
    }

    const res = await fetch(target, {
      method: 'POST',
      headers,
      body,
    })

    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-proxy] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!ADMIN_KEY) {
      return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
    }

    const { path } = await params
    const target = `${ENGINE_URL}/${path.join('/')}`

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
    console.error('[admin-proxy] DELETE error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
