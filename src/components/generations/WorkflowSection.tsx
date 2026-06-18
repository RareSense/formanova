import React from 'react';
import { motion } from 'framer-motion';
import { Box, ImageIcon } from 'lucide-react';
import { PeopleIcon } from '@/components/icons/PeopleIcon';
import { RingIcon } from '@/components/icons/RingIcon';
import { WorkflowCard } from './WorkflowCard';
import { PaginationBar } from './PaginationBar';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkflowSummary } from '@/lib/generation-history-api';

interface WorkflowSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  workflows: WorkflowSummary[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  indexOffset?: number;
  columns?: 2 | 3 | 4 | 5;
  onPageChange: (page: number) => void;
  onWorkflowClick: (id: string) => void;
  /** Forwarded to cards so an inline upscale completion can refresh the list. */
  onUpscaled?: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export function WorkflowSection({
  title,
  subtitle,
  icon,
  workflows,
  loading,
  currentPage,
  totalPages,
  indexOffset = 0,
  columns = 2,
  onPageChange,
  onWorkflowClick,
  onUpscaled,
}: WorkflowSectionProps) {
  const gridClass =
    columns === 5
      ? 'grid gap-2 grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'
      : columns === 4
      ? 'grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
      : columns === 3
      ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid gap-3 md:grid-cols-2';
  return (
    <section className="mb-14">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 flex items-center justify-center bg-primary/10 text-primary border border-border">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-2xl md:text-3xl uppercase tracking-wide text-foreground leading-none">
            {title}
          </h2>
          <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className={gridClass}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="marta-frame p-5">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && workflows.length === 0 && (
        <div className="marta-frame p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 flex items-center justify-center bg-muted mb-4">
            {icon}
          </div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            No generation history yet
          </p>
        </div>
      )}

      {/* Workflow cards */}
      {!loading && workflows.length > 0 && (
        <>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={gridClass}
          >
            {workflows.map((w, i) => (
              <WorkflowCard
                key={w.workflow_id}
                workflow={w}
                index={indexOffset + i + 1}
                onClick={onWorkflowClick}
                onUpscaled={onUpscaled}
              />
            ))}
          </motion.div>

          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
}

// Convenience icon exports for the page
export const SectionIcons = {
  photo: <PeopleIcon className="h-4 w-4" />,
  productShot: <RingIcon className="h-4 w-4" />,
  cadRender: <Box className="h-4 w-4" />,
  cadText: <RingIcon className="h-4 w-4" />,
  cadSketch: <ImageIcon className="h-4 w-4" />,
};
