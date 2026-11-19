import { getFeedSnapshot } from '@/lib/server-feed';
import { stringify } from '@/lib/wire';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return new Response(stringify(await getFeedSnapshot()), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
