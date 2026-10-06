import type { ReactNode } from 'react';
import { Eraser, History, ShieldAlert } from 'lucide-react';
import { formatDateTime, formatRelative } from '../../lib/FormatDate';
import { LogFeed, StatCard, StatGrid } from '../../components/Data';
import { Button, EmptyState } from '../../components/Primitives';
import { SectionCard } from '../../components/Fields';
import { useActivity } from '../../hooks/useActivity';
import { useToast } from '../../hooks/useToast';

export interface ActivityViewProps {
  confirmDestructive: boolean;
  onRequestClear: () => void;
}

/**
 * Audit trail.
 *
 * Everything the extension does - generation, mailbox registrations, API
 * failures, autofill runs - lands here, so a user can always answer "what did
 * this thing just do?" without opening DevTools.
 */
export function ActivityView({ confirmDestructive, onRequestClear }: ActivityViewProps): ReactNode {
  const toast = useToast();
  const activity = useActivity();

  async function handleClear(): Promise<void> {
    if (confirmDestructive) {
      onRequestClear();
      return;
    }

    try {
      const removed = await activity.clear();
      toast.info('Activity cleared', `${removed} entries removed.`);
    } catch (error) {
      toast.error('Could not clear', error instanceof Error ? error.message : 'Unknown error.');
    }
  }

  return (
    <>
      <div className="Pane__sections">
        <StatGrid>
          <StatCard label="Total" value={activity.stats.total} />
          <StatCard label="Success" value={activity.stats.successes} tone="success" />
          <StatCard label="Warnings" value={activity.stats.warnings} tone="warning" />
          <StatCard label="Errors" value={activity.stats.errors} tone="danger" />
        </StatGrid>

        <SectionCard
          icon={<History size={15} />}
          title="Recent activity"
          description={
            activity.stats.lastActivityAt
              ? `Last event ${formatRelative(activity.stats.lastActivityAt)} · ${formatDateTime(activity.stats.lastActivityAt)}`
              : 'Nothing recorded yet.'
          }
          actions={
            <Button
              variant="dangerOutline"
              size="sm"
              onClick={() => void handleClear()}
              disabled={activity.entries.length === 0}
              icon={<Eraser size={14} />}
            >
              Clear log
            </Button>
          }
        >
          <LogFeed
            entries={activity.entries}
            emptyState={
              <EmptyState
                icon={<ShieldAlert size={22} />}
                title="No activity yet"
                body="Generate an identity or refresh a mailbox and the events will show up here."
              />
            }
          />
        </SectionCard>
      </div>
    </>
  );
}
