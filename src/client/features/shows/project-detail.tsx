import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

type ShowItem = { id: string; name: string; status: string; orderKey?: string };

type ProjectContext = {
  project: {
    id: string;
    name: string;
    description: string | null;
    shows: ShowItem[];
  };
};

interface SortableShowRowProps {
  show: ShowItem;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function ConfirmDeleteModal({ show, onConfirm, onCancel, isPending }: { show: ShowItem | null; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <Card className="w-full max-w-sm bg-card/95">
        <CardHeader>
          <CardTitle>Delete show</CardTitle>
          <CardDescription>
            Are you sure you want to delete <strong>{show.name}</strong>? This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableShowRow({ show, onDelete, isDeleting }: SortableShowRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: show.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 border border-border/70 bg-background/65 p-3 transition-colors hover:border-primary/50"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <Link to={`/shows/${show.id}`} className="flex flex-1 items-center gap-3 min-w-0">
        <span className="truncate font-medium">{show.name}</span>
        <Badge className="shrink-0 capitalize">{show.status}</Badge>
      </Link>
      <button
        onClick={() => onDelete(show.id)}
        disabled={isDeleting}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
        aria-label="Delete show"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function ProjectDetail() {
  const navigate = useNavigate();
  const { project } = useOutletContext<ProjectContext>();
  const utils = trpc.useUtils();
  const [showName, setShowName] = useState("");
  const isDraggingRef = useRef(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [orderedShowIds, setOrderedShowIds] = useState<string[]>(() =>
    [...project.shows].sort((a, b) => (a.orderKey ?? "").localeCompare(b.orderKey ?? "")).map((s) => s.id),
  );

  const showById = Object.fromEntries(project.shows.map((s) => [s.id, s]));

  useEffect(() => {
    if (isDraggingRef.current) return;
    const serverIds = [...project.shows].sort((a, b) => (a.orderKey ?? "").localeCompare(b.orderKey ?? "")).map((s) => s.id);
    setOrderedShowIds(serverIds);
  }, [project.shows]);

  const createShowMutation = trpc.show.create.useMutation({
    onSuccess: async (show) => {
      setShowName("");
      await utils.project.list.invalidate();
      await utils.project.getById.invalidate({ projectId: project.id });
      navigate(`/shows/${show.id}`);
    },
  });

  const reorderShowsMutation = trpc.show.reorder.useMutation({
    onSuccess: async () => {
      await utils.project.list.invalidate();
      await utils.project.getById.invalidate({ projectId: project.id });
    },
  });

  const deleteShowMutation = trpc.show.delete.useMutation({
    onSuccess: async () => {
      setPendingDeleteId(null);
      await utils.project.list.invalidate();
      await utils.project.getById.invalidate({ projectId: project.id });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    isDraggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedShowIds((ids) => {
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      const next = arrayMove(ids, oldIndex, newIndex);
      reorderShowsMutation.mutate({ projectId: project.id, showIds: next });
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.description ?? "No description provided."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 md:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              createShowMutation.mutate({ projectId: project.id, name: showName });
            }}
          >
            <Input value={showName} onChange={(event) => setShowName(event.target.value)} placeholder="New show name" />
            <Button type="submit" disabled={!showName.trim() || createShowMutation.isPending}>
              Create show
            </Button>
          </form>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              isDraggingRef.current = true;
            }}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              isDraggingRef.current = false;
            }}
          >
            <SortableContext items={orderedShowIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {orderedShowIds.map((id) => {
                  const show = showById[id];
                  if (!show) return null;
                  return <SortableShowRow key={id} show={show} onDelete={(id) => setPendingDeleteId(id)} isDeleting={deleteShowMutation.isPending} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
      <ConfirmDeleteModal
        show={pendingDeleteId ? (showById[pendingDeleteId] ?? null) : null}
        onConfirm={() => { if (pendingDeleteId) deleteShowMutation.mutate({ showId: pendingDeleteId }); }}
        onCancel={() => setPendingDeleteId(null)}
        isPending={deleteShowMutation.isPending}
      />
    </div>
  );
}
