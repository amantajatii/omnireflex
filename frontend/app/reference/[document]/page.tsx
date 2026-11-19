import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { Footer, Nav } from '@/components/Shared';
import styles from './page.module.css';
export function generateStaticParams() {
  return [{ document: 'architecture' }, { document: 'deployment' }];
}
export default async function Reference({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!['architecture', 'deployment'].includes(document)) notFound();
  const content = await readFile(path.join(process.cwd(), 'reference', `${document}.md`), 'utf8');
  return (
    <>
      <Nav />
      <main id="main">
        <article className={`panel ${styles.article}`}>
          <h1>{document === 'architecture' ? 'Architecture' : 'Deployment'}</h1>
          <p>Repository reference · original Markdown</p>
          <pre>{content}</pre>
        </article>
      </main>
      <Footer />
    </>
  );
}
