import { candleCaches, parseGranularity } from '@/lib/server-candles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const granularity = parseGranularity(new URL(request.url).searchParams.get('granularity'));
  if (granularity === undefined)
    return Response.json({ error: 'Unsupported candle granularity' }, { status: 400 });
  return Response.json(await candleCaches.get(granularity)!.get(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
