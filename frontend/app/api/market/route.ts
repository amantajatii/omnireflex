import { marketCaches } from '@/lib/server-market';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const chainId = Number(new URL(request.url).searchParams.get('chainId'));
  if (chainId !== 1301 && chainId !== 84532)
    return Response.json({ error: 'Unsupported destination chain' }, { status: 400 });
  return Response.json(await marketCaches[chainId].get(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
