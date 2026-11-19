import type { ReactNode } from 'react';
import { Corners } from './Shared';
import styles from './PageHeader.module.css';
type PageHeaderProps = {
  title: string;
  subtitle: string;
  breadcrumb: string;
  children?: ReactNode;
};
export function PageHeader({ title, subtitle, breadcrumb, children }: PageHeaderProps) {
  return (
    <section className={`panel frame ${styles.header}`}>
      <Corners />
      <div>
        <p className={styles.breadcrumb}>{breadcrumb}</p>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  );
}
