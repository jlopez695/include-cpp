'use client';

import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import type { ProblemSummary } from '@/lib/types';

interface Props {
  problems: ProblemSummary[];
}

export function SidebarWrapper({ problems }: Props) {
  const params = useParams<{ id?: string }>();
  return <Sidebar problems={problems} activeId={params.id ?? ''} />;
}
