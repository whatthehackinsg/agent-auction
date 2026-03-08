import { NextRequest, NextResponse } from 'next/server'

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8787'
const ADMIN_KEY = process.env.ENGINE_ADMIN_KEY

async function proxyRequest(
  req: NextRequest,
  path: string[],
  method: 'GET' | 'POST' | 'DELETE',
) {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: 'admin key not configured' }, { status: 500 })
  }

  const targetUrl = new URL(`${ENGINE_URL}/${path.join('/')}`)
  const incomingUrl = new URL(req.url)
  targetUrl.search = incomingUrl.search

  const contentType = req.headers.get('Content-Type') ?? 'application/json'
  const isMultipart = contentType.includes('multipart/form-data')
  const body =
    method === 'GET'
      ? undefined
      : isMultipart
        ? await req.arrayBuffer()
        : await req.text()

  const headers: Record<string, string> = {
    'X-ENGINE-ADMIN-KEY': ADMIN_KEY,
  }

  if (method !== 'GET') {
    headers['Content-Type'] = contentType
  }

  const res = await fetch(targetUrl, {
    method,
    headers,
    body,
  })

  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params
    return await proxyRequest(req, path, 'GET')
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
    const { path } = await params
    return await proxyRequest(req, path, 'POST')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-proxy] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params
    return await proxyRequest(req, path, 'DELETE')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-proxy] DELETE error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
