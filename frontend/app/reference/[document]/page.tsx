import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { Footer, Nav } from '@/components/Shared';
import styles from './page.module.css';

const DOCUMENTS = ['architecture', 'deployment'] as const;

export function generateStaticParams() {
  return DOCUMENTS.map((document) => ({ document }));
}

export default async function Reference({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!(DOCUMENTS as readonly string[]).includes(document)) notFound();
  const source = await readFile(path.join(process.cwd(), 'reference', `${document}.md`), 'utf8');
  // Trusted input: these files are copies of docs/ in this repository, rendered at build time.
  const html = await marked.parse(source, { gfm: true });
  return (
    <>
      <Nav />
      <main id="main">
        <article className={`panel ${styles.article}`} dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <Footer />
    </>
  );
}
