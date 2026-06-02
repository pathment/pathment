import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Archive, Plus, Layers } from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { Modal } from '@/components/overlays';
import { EFFORT_META } from '@/lib/ai';
import {
  Badge,
  Button,
  Card,
  SectionLabel,
  STATUS_META,
  cx,
} from '@/lib/ui';
import type { Task, Track } from '@/lib/types';

/* ----------------------------------------------------------------
   TracksPanel (brief §5) - create a track in seconds, fast in.
   A tight, scannable list of a mentee's tracks. Inline create + rename,
   archive, "from template", and a minimal per-track task list with an
   inline "+ task" row. Keyboard-first: Enter commits, Escape cancels.
----------------------------------------------------------------- */
export function TracksPanel({ menteeId }: { menteeId: number }) {
  const { getTracks, getMentee, createTrack, renameTrack, archiveTrack, createTrackFromTemplate, assignTask, templates } =
    useStore();

  const tracks = getTracks(menteeId);
  const tasks = getMentee(menteeId)?.tasks ?? [];

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);

  const commitCreate = () => {
    const name = draftName.trim();
    if (name) createTrack(menteeId, name);
    setDraftName('');
    setCreating(false);
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Tracks</SectionLabel>
        <span className="font-mono text-[11px] text-ink-faint tnum">{tracks.length}</span>
      </div>

      <div className="space-y-2">
        {tracks.length === 0 && !creating && (
          <p className="text-sm text-ink-faint">No tracks yet - add one below.</p>
        )}

        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            tasks={tasks.filter((t) => t.trackId === track.id || t.track === track.name)}
            onRename={(name) => renameTrack(menteeId, track.id, name)}
            onArchive={() => archiveTrack(menteeId, track.id)}
            onAddTask={(title) =>
              assignTask(menteeId, {
                title,
                type: 'assignment',
                due: '+3 days',
                track: track.name,
                trackId: track.id,
                criteria: [],
              })
            }
          />
        ))}
      </div>

      {/* Inline "+ Track" - the "seconds" path, no modal */}
      <div className="mt-2">
        {creating ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') {
                setDraftName('');
                setCreating(false);
              }
            }}
            placeholder="Track name…"
            className="w-full rounded-r border border-hairline bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded-r border border-dashed border-hairline px-2.5 py-1.5 text-xs font-medium text-ink-mute transition-colors hover:border-ink hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Track
          </button>
        )}
      </div>

      {/* Start from template */}
      <div className="mt-3 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(true)}>
          <Layers className="h-3.5 w-3.5" /> From template
        </Button>
      </div>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Start from a template"
        subtitle="Creates the track and drops its tasks in."
      >
        <div className="space-y-2">
          {templates.tracks.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                createTrackFromTemplate(menteeId, tpl.id);
                setTemplateOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-r border border-hairline px-3 py-2.5 text-left transition-colors hover:border-ink"
            >
              <span className="text-sm font-medium text-ink">{tpl.name}</span>
              <span className="font-mono text-[11px] text-ink-faint tnum">
                {tpl.taskTemplateIds.length} tasks
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </Card>
  );
}

/* ----------------------------------------------------------------
   A single track row - name + task count + caret to expand, with an
   inline rename input and an archive control. Expanding reveals a
   compact task list and a tiny "+ task" inline row.
----------------------------------------------------------------- */
function TrackRow({
  track,
  tasks,
  onRename,
  onArchive,
  onAddTask,
}: {
  track: Track;
  tasks: Task[];
  onRename: (name: string) => void;
  onArchive: () => void;
  onAddTask: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [addingTask, setAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');

  const commitRename = () => {
    const next = name.trim();
    if (next && next !== track.name) onRename(next);
    else setName(track.name);
    setEditing(false);
  };

  const commitTask = () => {
    const title = taskTitle.trim();
    if (title) onAddTask(title);
    setTaskTitle('');
    setAddingTask(false);
  };

  return (
    <div className="rounded-r border border-hairline">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-ink-faint transition-colors hover:text-ink"
          aria-label={open ? 'Collapse track' : 'Expand track'}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setName(track.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-r border border-hairline bg-white px-2 py-1 text-sm text-ink focus:border-brand-400"
          />
        ) : (
          <button
            onClick={() => setOpen((v) => !v)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink"
          >
            {track.name}
          </button>
        )}

        <span className="font-mono text-[11px] text-ink-faint tnum">{tasks.length}</span>

        {!editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-ink-faint transition-colors hover:text-ink"
              aria-label="Rename track"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onArchive}
              className="text-ink-faint transition-colors hover:text-[#FF3B30]"
              aria-label="Archive track"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-hairline px-2.5 py-2">
          {tasks.length === 0 && !addingTask && (
            <p className="text-[11px] text-ink-faint">No tasks in this track yet.</p>
          )}

          {tasks.map((t) => {
            const s = STATUS_META[t.status];
            const eff = t.effort ? EFFORT_META[t.effort] : null;
            return (
              <div key={t.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{t.title}</span>
                {eff && (
                  <span className="font-mono text-[10px] text-ink-faint" title={eff.hint}>
                    {eff.label}
                  </span>
                )}
                {s && <Badge tone={s.tone}>{s.label}</Badge>}
              </div>
            );
          })}

          {addingTask ? (
            <input
              autoFocus
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onBlur={commitTask}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTask();
                if (e.key === 'Escape') {
                  setTaskTitle('');
                  setAddingTask(false);
                }
              }}
              placeholder="Task title…"
              className="w-full rounded-r border border-hairline bg-white px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-brand-400"
            />
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className={cx(
                'flex w-full items-center gap-1 text-[11px] font-medium text-ink-mute transition-colors hover:text-ink',
              )}
            >
              <Plus className="h-3 w-3" /> task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
