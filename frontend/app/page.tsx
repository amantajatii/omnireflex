import { FeedProvider } from '@/lib/feed';
import Landing from '@/components/Landing';
export default function Page() {
  return (
    <FeedProvider>
      <Landing />
    </FeedProvider>
  );
}
