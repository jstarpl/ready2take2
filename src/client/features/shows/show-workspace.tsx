import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SERVER_URL, trpc } from "@/client/lib/trpc";
import { Badge } from "@/client/components/ui/badge";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { TimeEntry } from "@/client/components/ui/time-entry";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/client/components/ui/menubar";
import { Textarea } from "@/client/components/ui/textarea";
import { ShowMediaPlayer } from "@/client/features/shows/show-media-player";
import { formatOffset } from "@/client/lib/utils";
import { useShowWorkspaceStore, resetAddCueForm, resetAddTrackForm, getOrCreateStore, ShowWorkspaceStoreContext } from "@/client/features/shows/show-workspace-store";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Upload, ArrowLeft, Video } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import type { ShowEvent } from "@/shared/types/domain";
import { ref, useSnapshot } from "valtio";

type RouterOutput = inferRouterOutputs<AppRouter>;
type ShowDetail = NonNullable<RouterOutput["show"]["getDetail"]>;
type CueRow = ShowDetail["cues"][number];

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getMediaPreviewKind(mimeType: string | null | undefined, fileName: string) {
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }

  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }

  if (mimeType?.startsWith("audio/")) {
    return "audio" as const;
  }

  const normalizedFileName = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(normalizedFileName)) {
    return "image" as const;
  }

  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(normalizedFileName)) {
    return "video" as const;
  }

  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(normalizedFileName)) {
    return "audio" as const;
  }

  return "none" as const;
}

function MediaPreview({
  src,
  mimeType,
  fileName,
  alt,
}: {
  src: string;
  mimeType?: string | null;
  fileName: string;
  alt: string;
}) {
  const previewKind = getMediaPreviewKind(mimeType, fileName);

  if (previewKind === "image") {
    return <img src={src} alt={alt} className="h-28 w-full border border-border/60 object-cover" />;
  }

  if (previewKind === "video") {
    return <video src={src} controls className="h-28 w-full border border-border/60 bg-black object-cover" />;
  }

  if (previewKind === "audio") {
    return <audio src={src} controls className="w-full" preload="metadata" />;
  }

  return (
    <div className="flex h-28 w-full items-center justify-center border border-dashed border-border/70 bg-background/40 px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
      No preview
    </div>
  );
}

interface SortableCueRowProps {
  cue: CueRow;
  show: ShowDetail;
  gridTemplateColumns: string;
  cueCommentDraft: string;
  cueTrackValueDrafts: Record<string, string>;
  cameraColors: Map<string, string>;
  onCommentChange: (cueId: string, value: string) => void;
  onCommentBlur: (cue: CueRow, value: string) => void;
  onTrackValueChange: (key: string, value: string) => void;
  onTrackValueBlur: (cue: CueRow, trackId: string, value: string) => void;
  onSetCurrent: (cueId: string) => void;
  onSetNext: (cueId: string) => void;
  onDelete: (cueId: string) => void;
  isDeleting: boolean;
  isSelected: boolean;
  onSelect: (cueId: string) => void;
}

interface ModalDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}

interface SheetDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}

function ModalDialog({ open, title, description, onClose, children }: ModalDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <Card className="w-full max-w-lg bg-card/95">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function SheetDialog({ open, title, description, onClose, children }: SheetDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm mt-0">
      <button className="flex-1 cursor-default" aria-label="Close media panel" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-border/70 bg-card/95 shadow-2xl">
        <CardHeader className="border-b border-border/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function SortableCueRow({
  cue,
  show,
  gridTemplateColumns,
  cueCommentDraft,
  cueTrackValueDrafts,
  cameraColors,
  onCommentChange,
  onCommentBlur,
  onTrackValueChange,
  onTrackValueBlur,
  onSetCurrent,
  onSetNext,
  onDelete,
  isDeleting,
  isSelected,
  onSelect,
}: SortableCueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cue.id });

  const isCurrent = show.currentCueId === cue.id;
  const isNext = show.nextCueId === cue.id;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridTemplateColumns,
  };

  const leftBorderClass = isCurrent
    ? "border-l-[10px] border-l-red-500 pl-[3px]"
    : isNext
      ? "border-l-[10px] border-l-green-500 pl-[3px]"
      : "";

  const selectedClass = isSelected ? "ring-2 ring-primary bg-primary/10" : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(cue.id)}
      className={`cursor-pointer grid items-start gap-3 border border-border/70 bg-background/65 p-3 transition-colors ${leftBorderClass} ${selectedClass}`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <div className="font-mono font-semibold text-muted-foreground">{cue.cueId}</div>
      </div>
      <div className="flex items-center gap-2">
        <div>
          <div className="font-mono">{cue.cueOffsetMs !== null ? formatOffset(cue.cueOffsetMs) : ""}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={show.currentCueId === cue.id ? "secondary" : "outline"} onClick={() => onSetCurrent(cue.id)}>
          Current
        </Button>
        <Button size="sm" variant={show.nextCueId === cue.id ? "secondary" : "outline"} onClick={() => onSetNext(cue.id)}>
          Next
        </Button>
      </div>
      <Textarea
        value={cueCommentDraft}
        className="min-h-10 resize-y text-sm leading-6"
        placeholder="Cue comment"
        onChange={(event) => onCommentChange(cue.id, event.target.value)}
        onBlur={(event) => onCommentBlur(cue, event.target.value)}
      />
      {show.tracks.map((track) => {
        const draftKey = `${cue.id}:${track.id}`;
        const currentValue = cueTrackValueDrafts[draftKey] ?? "";
        const swatchColor = track.type === "camera" ? cameraColors.get(currentValue.trim()) : undefined;
        return (
          <div key={track.id} className="flex items-center gap-1.5">
            {track.type === "camera" && (
              <div
                className="h-5 w-5 shrink-0 rounded-full border border-border/50 transition-colors"
                style={{ backgroundColor: swatchColor ?? "transparent" }}
                title={swatchColor ? `Color for "${currentValue}"` : "No color assigned"}
              />
            )}
            <Input
              value={currentValue}
              placeholder="Technical identifier"
              onChange={(event) => onTrackValueChange(draftKey, event.target.value)}
              onBlur={(event) => onTrackValueBlur(cue, track.id, event.target.value)}
            />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(cue.id)}
          disabled={isDeleting}
          aria-label={`Delete cue ${cue.comment || (cue.cueOffsetMs !== null ? formatOffset(cue.cueOffsetMs) : "with no comment")}`}
          title="Delete cue"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}

/** Provider component for the workspace store */
function ShowWorkspaceStoreProvider({
  showId,
  children,
}: {
  showId: string;
  children: React.ReactNode;
}) {
  const store = useMemo(() => {
    return getOrCreateStore(showId);
  }, [showId]);

  return (
    <ShowWorkspaceStoreContext.Provider value={store}>
      {children}
    </ShowWorkspaceStoreContext.Provider>
  );
}

/** Wrapper component that provides the valtio store for the show workspace */
export function ShowWorkspace() {
  const { showId } = useParams();

  if (!showId) {
    return (
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>Invalid show</CardTitle>
          <CardDescription>Could not find show ID in route.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ShowWorkspaceStoreProvider showId={showId}>
      <ShowWorkspaceContent />
    </ShowWorkspaceStoreProvider>
  );
}

/** Inner component that uses the valtio store */
function ShowWorkspaceContent() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { showId } = useParams();
  const store = useShowWorkspaceStore();
  const snapshot = useSnapshot(store);

  const addCueFormRef = useRef<HTMLFormElement | null>(null);
  const addCueCommentRef = useRef<HTMLTextAreaElement | null>(null);
  const [cueCommentDrafts, setCueCommentDrafts] = useState<Record<string, string>>({});
  const [cueTrackValueDrafts, setCueTrackValueDrafts] = useState<Record<string, string>>({});
  const [orderedCueIds, setOrderedCueIds] = useState<string[]>([]);
  const [deletingMediaFileId, setDeletingMediaFileId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedUploadPreviewUrl = useMemo(() => {
    if (!snapshot.selectedUpload) {
      return null;
    }

    return URL.createObjectURL(snapshot.selectedUpload);
  }, [snapshot.selectedUpload]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const showQuery = trpc.show.getDetail.useQuery(
    { showId: showId ?? "" },
    { enabled: Boolean(showId) },
  );

  const cameraColorSettingsQuery = trpc.cameraColorSetting.list.useQuery();
  const cameraColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const setting of cameraColorSettingsQuery.data ?? []) {
      map.set(setting.identifier, setting.color);
    }
    return map;
  }, [cameraColorSettingsQuery.data]);

  trpc.show.subscribe.useSubscription(
    { showId: showId ?? "" },
    {
      enabled: Boolean(showId),
      onData: async (event) => {
        if (!showId) {
          return;
        }

        const showEvent = event as unknown as ShowEvent;

        if (showEvent.type === "mediaFile.created" || showEvent.type === "mediaFile.deleted") {
          await utils.show.getDetail.invalidate({ showId });
          return;
        }

        await utils.show.getDetail.invalidate({ showId });
        await utils.project.list.invalidate();
      },
    },
  );

  const createCueMutation = trpc.cue.create.useMutation({
    onSuccess: async (createdCue) => {
      store.selectedCueId = createdCue.id;
      resetAddCueForm(store);
      store.activeModal = null;
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });

  const createTrackMutation = trpc.track.create.useMutation({
    onSuccess: async () => {
      resetAddTrackForm(store);
      store.activeModal = null;
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const deleteTrackMutation = trpc.track.delete.useMutation({
    onSuccess: async () => {
      store.trackToRemoveId = "";
      store.activeModal = null;
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const deleteCueMutation = trpc.cue.delete.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });

  const setCurrentCueMutation = trpc.show.setCurrentCue.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const setNextCueMutation = trpc.show.setNextCue.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const takeShowMutation = trpc.show.take.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const updateCueMutation = trpc.cue.update.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const updateCueTrackValueMutation = trpc.cueTrackValue.update.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const reorderCueMutation = trpc.cue.reorder.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });

  const resetCueIdsMutation = trpc.cue.resetIds.useMutation({
    onSuccess: async () => {
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });

  const show = showQuery.data;
  const cueById = useMemo(() => new Map((show?.cues ?? []).map((c) => [c.id, c])), [show?.cues]);
  const cueRows = useMemo(
    () => orderedCueIds.flatMap((id) => (cueById.get(id) ? [cueById.get(id)!] : [])),
    [orderedCueIds, cueById],
  );
  const selectedCue = useMemo(
    () => (snapshot.selectedCueId ? cueById.get(snapshot.selectedCueId) ?? null : null),
    [snapshot.selectedCueId, cueById],
  );
  const canTake = Boolean(showId && show?.nextCueId && !takeShowMutation.isPending);
  const canMoveCueToNow = Boolean(selectedCue && !updateCueMutation.isPending);

  const nextCueId = useMemo(() => {
    if (!show?.cues.length) return "1";
    const max = show.cues.reduce((m, c) => {
      const n = parseInt(c.cueId, 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return String(max + 1);
  }, [show?.cues]);

  function handleTake() {
    if (!showId || !show?.nextCueId || takeShowMutation.isPending) {
      return;
    }

    takeShowMutation.mutate({ showId });
  }

  function handleMoveCueToNow() {
    if (!selectedCue || updateCueMutation.isPending) {
      return;
    }

    updateCueMutation.mutate({
      id: selectedCue.id,
      comment: selectedCue.comment,
      cueOffsetMs: Math.max(0, Math.round(store.currentTimeMs)),
    });
  }

  function handleDragStart(_event: DragStartEvent) {
    isDraggingRef.current = true;
  }

  function handleDragCancel() {
    isDraggingRef.current = false;
  }

  function handleDragEnd(event: DragEndEvent) {
    isDraggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id || !showId) return;
    setOrderedCueIds((ids) => {
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      const next = arrayMove(ids, oldIndex, newIndex);
      reorderCueMutation.mutate({ showId, cueIds: next });
      return next;
    });
  }

  useEffect(() => {
    if (!show) {
      return;
    }

    // Sync server order into local state, but don't clobber an in-flight drag.
    // Adopt the server's authoritative order unless a drag is in flight.
    setOrderedCueIds((current) => {
      const serverIds = show.cues.map((c) => c.id);
      if (!isDraggingRef.current) {
        return serverIds;
      }
      // During an active drag: keep current order, append newly added cues.
      const currentSet = new Set(current);
      const added = serverIds.filter((id) => !currentSet.has(id));
      const serverSet = new Set(serverIds);
      return [...current.filter((id) => serverSet.has(id)), ...added];
    });

    const nextCommentDrafts: Record<string, string> = {};
    const nextDrafts: Record<string, string> = {};
    for (const cue of show.cues) {
      nextCommentDrafts[cue.id] = cue.comment;
      for (const track of show.tracks) {
        const value = cue.cueTrackValues.find((entry) => entry.trackId === track.id);
        nextDrafts[`${cue.id}:${track.id}`] = value?.technicalIdentifier ?? "";
      }
    }

    setCueCommentDrafts(nextCommentDrafts);
    setCueTrackValueDrafts(nextDrafts);
  }, [show]);

  useEffect(() => {
    if (!showId) {
      navigate("/");
    }
  }, [showId, navigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

      if (event.code === "F12") {
        event.preventDefault();
        if (!showId || !show?.nextCueId || takeShowMutation.isPending) {
          return;
        }

        handleTake();
        return;
      }

      if (event.ctrlKey && event.code === "KeyM") {
        if (isEditableTarget) {
          return;
        }

        event.preventDefault();
        handleMoveCueToNow();
        return;
      }

      if (event.ctrlKey && event.altKey && event.code === "Space") {
        event.preventDefault();
        store.activeModal = "addCue";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleMoveCueToNow, handleTake, show?.nextCueId, showId, takeShowMutation.isPending, store]);

  useEffect(() => {
    if (store.activeModal !== "addCue") {
      return;
    }

    // When opening the Add Cue dialog, set the offset to the current media time (or default)
    if (store.currentTimeMs > 0) {
      store.newCueOffsetMs = Math.round(store.currentTimeMs);
    } else {
      store.newCueOffsetMs = 0;
    }
    store.newCueCueId = nextCueId;

    const frameId = window.requestAnimationFrame(() => {
      addCueCommentRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [store.activeModal, store.currentTimeMs, store, nextCueId]);

  useEffect(() => {
    if (!show?.tracks.length) {
      store.trackToRemoveId = "";
      return;
    }

    if (!show.tracks.some((track) => track.id === store.trackToRemoveId)) {
      store.trackToRemoveId = show.tracks[show.tracks.length - 1]?.id ?? "";
    }
  }, [show?.tracks, store]);

  useEffect(() => {
    if (!show || !snapshot.selectedMediaFileId) {
      return;
    }

    const stillExists = show.mediaFiles.some((file) => file.id === snapshot.selectedMediaFileId);
    if (!stillExists) {
      store.selectedMediaFileId = null;
    }
  }, [show, snapshot.selectedMediaFileId, store]);

  useEffect(() => {
    return () => {
      if (selectedUploadPreviewUrl) {
        URL.revokeObjectURL(selectedUploadPreviewUrl);
      }
    };
  }, [selectedUploadPreviewUrl]);

  if (!show) {
    return (
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>Loading workspace</CardTitle>
          <CardDescription>Fetching show details and realtime state.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function uploadSelectedFile() {
    if (!showId || !store.selectedUpload) {
      return;
    }

    store.isUploading = true;
    store.uploadError = null;

    try {
      const formData = new FormData();
      formData.append("file", store.selectedUpload);

      const response = await fetch(`${SERVER_URL}/api/shows/${showId}/uploads`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Upload failed.");
      }

      store.selectedUpload = null;
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }

      await utils.show.getDetail.invalidate({ showId });
    } catch (error) {
      store.uploadError = error instanceof Error ? error.message : "Upload failed.";
    } finally {
      store.isUploading = false;
    }
  }

  async function deleteMediaFile(mediaFileId: string) {
    if (!showId) {
      return;
    }

    setDeletingMediaFileId(mediaFileId);
    store.uploadError = null;

    try {
      const response = await fetch(`${SERVER_URL}/api/shows/${showId}/uploads/${mediaFileId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Delete failed.");
      }

      await utils.show.getDetail.invalidate({ showId });
    } catch (error) {
      store.uploadError = error instanceof Error ? error.message : "Delete failed.";
    } finally {
      setDeletingMediaFileId(null);
    }
  }

  function handleFileSelection(file: File | null) {
    store.uploadError = null;
    store.selectedUpload = file === null ? null : ref(file);
  }

  function submitNewCue() {
    const comment = store.newCueComment.trim();

    if (!showId || createCueMutation.isPending) {
      return;
    }

    createCueMutation.mutate({
      showId,
      comment,
      cueId: store.newCueCueId.trim() || undefined,
      cueOffsetMs: store.newCueOffsetMs,
    });
  }

  return (
    <>
      <div className="space-y-6 pb-52 pt-[5.5em]">
        <Card className="fixed top-0 left-0 right-0 z-40 bg-card/75">
          <CardHeader className="grid items-center gap-4 grid-cols-[auto_1fr_auto] justify-items-start">
            <div>
              <Button variant="ghost" size="default" onClick={() => navigate("/shows")} aria-label="Back to show list">
                <ArrowLeft size={24} />
              </Button>
            </div>
            <div>
              <Menubar>
                <MenubarMenu>
                  <MenubarTrigger>Cue</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => (store.activeModal = "addCue")}>
                      Add cue
                      <MenubarShortcut>Ctrl+Alt+Space</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem disabled={!canMoveCueToNow} onSelect={handleMoveCueToNow}>
                      Move cue to now
                      <MenubarShortcut>Ctrl+M</MenubarShortcut>
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem
                      disabled={!show || resetCueIdsMutation.isPending}
                      onSelect={() => showId && resetCueIdsMutation.mutate({ showId })}
                    >
                      Reset Cue IDs
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Production</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem disabled={!canTake} onSelect={handleTake}>
                      Take
                      <MenubarShortcut>F12</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem onSelect={() => window.open(`/shows/${showId}/cue-list-view`, '_blank')}>
                      Open Cue List View
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Track</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => (store.activeModal = "addTrack")}>Add track</MenubarItem>
                    <MenubarItem
                      disabled={!show.tracks.length || deleteTrackMutation.isPending}
                      onSelect={() => (store.activeModal = "removeTrack")}
                    >
                      Remove track
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Media</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => (store.activeModal = "media")}>Open media manager</MenubarItem>
                    <MenubarSeparator />
                    {show.mediaFiles.length === 0 ? (
                      <MenubarItem disabled>No media files</MenubarItem>
                    ) : (
                      show.mediaFiles.map((mediaFile) => (
                        <MenubarCheckboxItem
                          key={mediaFile.id}
                          checked={snapshot.selectedMediaFileId === mediaFile.id}
                          onCheckedChange={() => {
                            store.selectedMediaFileId =
                              snapshot.selectedMediaFileId === mediaFile.id ? null : mediaFile.id;
                          }}
                        >
                          {mediaFile.originalName}
                        </MenubarCheckboxItem>
                      ))
                    )}
                  </MenubarContent>
                </MenubarMenu>
              </Menubar>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex gap-2 items-center flex-wrap">
                <CardTitle>{show.name}</CardTitle>
                <Badge>{show.status}</Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="min-w-[900px] space-y-4 mx-3">
          <div
            className="gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground grid mx-3"
            style={{ gridTemplateColumns: `70px 150px 180px 220px repeat(${Math.max(show.tracks.length, 1)}, minmax(180px, 1fr)) min-content` }}
          >
            <div className="px-3">ID</div>
            <div className="px-3">Offset</div>
            <div className="px-3">Current / Next</div>
            <div className="px-3">Comment</div>
            {show.tracks.map((track) => (
              <div key={track.id} className="px-3 flex items-center gap-1.5">
                {track.name}
                {track.type === "camera" && (
                  <span className="rounded bg-blue-500/20 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                    <Video size={12} />
                  </span>
                )}
              </div>
            ))}
            <div></div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <SortableContext items={orderedCueIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {cueRows.map((cue) => (
                  <SortableCueRow
                    key={cue.id}
                    cue={cue}
                    show={show}
                    gridTemplateColumns={`80px 150px 180px 220px repeat(${Math.max(show.tracks.length, 1)}, minmax(180px, 1fr)) min-content`}
                    cueCommentDraft={cueCommentDrafts[cue.id] ?? ""}
                    cueTrackValueDrafts={cueTrackValueDrafts}
                    cameraColors={cameraColors}
                    onCommentChange={(cueId, value) =>
                      setCueCommentDrafts((d) => ({ ...d, [cueId]: value }))
                    }
                    onCommentBlur={(c, value) => {
                      const next = value.trim();
                      if (next === c.comment.trim()) return;
                      updateCueMutation.mutate({ id: c.id, comment: next, cueOffsetMs: c.cueOffsetMs });
                    }}
                    onTrackValueChange={(key, value) =>
                      setCueTrackValueDrafts((d) => ({ ...d, [key]: value }))
                    }
                    onTrackValueBlur={(c, trackId, value) => {
                      const next = value.trim() || null;
                      const existing = c.cueTrackValues.find((v) => v.trackId === trackId);
                      if (next === (existing?.technicalIdentifier ?? null)) return;
                      updateCueTrackValueMutation.mutate({ cueId: c.id, trackId, technicalIdentifier: next });
                    }}
                    onSetCurrent={(cueId) => showId && setCurrentCueMutation.mutate({ showId, cueId })}
                    onSetNext={(cueId) => showId && setNextCueMutation.mutate({ showId, cueId })}
                    onDelete={(cueId) => deleteCueMutation.mutate({ id: cueId })}
                    isDeleting={deleteCueMutation.isPending}
                    isSelected={snapshot.selectedCueId === cue.id}
                    onSelect={(cueId) => (store.selectedCueId = cueId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {cueRows.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground pt-40">
              <div>Create new cues using the <span className="text-foreground">Cue 🠊 Add cue</span> menu or using the <kbd className="text-foreground">Ctrl+Alt+Space</kbd> hotkey.</div>
            </div>
          )}
        </div>

        <ModalDialog
          open={store.activeModal === "addCue"}
          title="Add cue"
          description="Create a show-level cue across every track."
          onClose={() => {
            resetAddCueForm(store, nextCueId);
            store.activeModal = null;
          }}
        >
          <form
            ref={addCueFormRef}
            className="space-y-3"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                resetAddCueForm(store, nextCueId);
                store.activeModal = null;
                return;
              }

              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }

              event.preventDefault();
              addCueFormRef.current?.requestSubmit();
            }}
            onSubmit={(event) => {
              event.preventDefault();
              submitNewCue();
            }}
          >
            <div className="text-sm text-muted-foreground">Cue ID</div>
            <Input
              value={snapshot.newCueCueId}
              onChange={(event) => (store.newCueCueId = event.target.value)}
              placeholder="Cue ID"
            />
            <Textarea
              ref={addCueCommentRef}
              value={snapshot.newCueComment}
              onChange={(event) => (store.newCueComment = event.target.value)}
              placeholder="Cue comment"
            />
            <TimeEntry
              value={snapshot.newCueOffsetMs}
              onValueChange={(value) => (store.newCueOffsetMs = value)}
              placeholder="0:00"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                resetAddCueForm(store, nextCueId);
                store.activeModal = null;
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCueMutation.isPending}>
                Add cue
              </Button>
            </div>
          </form>
        </ModalDialog>

        <ModalDialog
          open={snapshot.activeModal === "addTrack"}
          title="Add track"
          description="Backfills a technical identifier slot for every existing cue."
          onClose={() => {
            resetAddTrackForm(store);
            store.activeModal = null;
          }}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!showId) return;
              createTrackMutation.mutate({ showId, name: store.newTrackName, type: store.newTrackType });
            }}
          >
            <Input value={snapshot.newTrackName} onChange={(event) => (store.newTrackName = event.target.value)} placeholder="Track name" />
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Track type</div>
              <div className="flex gap-3">
                {(["custom", "camera"] as const).map((type) => (
                  <label key={type} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="newTrackType"
                      value={type}
                      checked={snapshot.newTrackType === type}
                      onChange={() => (store.newTrackType = type)}
                      className="accent-primary"
                    />
                    <span className="capitalize text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                resetAddTrackForm(store);
                store.activeModal = null;
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={!snapshot.newTrackName.trim() || createTrackMutation.isPending}>
                Add track
              </Button>
            </div>
          </form>
        </ModalDialog>

        <ModalDialog
          open={snapshot.activeModal === "removeTrack"}
          title="Remove track"
          description="Remove a track and all associated technical identifier values."
          onClose={() => (store.activeModal = null)}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!store.trackToRemoveId) return;
              deleteTrackMutation.mutate({ id: store.trackToRemoveId });
            }}
          >
            <select
              className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm"
              value={snapshot.trackToRemoveId}
              onChange={(event) => (store.trackToRemoveId = event.target.value)}
            >
              {show.tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name} ({track.type})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => (store.activeModal = null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!snapshot.trackToRemoveId || deleteTrackMutation.isPending}>
                Remove track
              </Button>
            </div>
          </form>
        </ModalDialog>
      </div>
      {snapshot.selectedMediaFileId && <ShowMediaPlayer
        show={show}
        serverUrl={SERVER_URL}
        selectedMediaFileId={snapshot.selectedMediaFileId}
        pauseRequested={snapshot.activeModal === "addCue"}
        onCurrentTimeChange={(ms) => (store.currentTimeMs = ms)}
      />}
      <SheetDialog
        open={snapshot.activeModal === "media"}
        title="Media manager"
        description="Upload, preview, and remove show media without leaving the cue workspace."
        onClose={() => (store.activeModal = null)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{show.mediaFiles.length} file{show.mediaFiles.length === 1 ? "" : "s"}</div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void uploadSelectedFile();
            }}
          >
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
            />

            <div
              className={`border-2 border-dashed p-5 transition ${store.isDragActive ? "border-primary bg-primary/5" : "border-border/70 bg-background/35"
                }`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                store.isDragActive = true;
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!store.isDragActive) {
                  store.isDragActive = true;
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                store.isDragActive = false;
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                store.isDragActive = false;
                handleFileSelection(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Drop a file here or browse from disk</div>
                  <div className="text-sm text-muted-foreground">
                    Uploaded files are stored in data/uploads and served from the app server.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => uploadInputRef.current?.click()}>
                    Choose file
                  </Button>
                  <Button type="submit" disabled={!snapshot.selectedUpload || snapshot.isUploading} className="gap-2">
                    <Upload size={16} />
                    {snapshot.isUploading ? "Uploading..." : "Upload media"}
                  </Button>
                </div>
              </div>

              {snapshot.selectedUpload ? (
                <div className="mt-4 grid gap-4 border border-border/60 bg-background/55 p-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    {selectedUploadPreviewUrl ? (
                      <MediaPreview
                        src={selectedUploadPreviewUrl}
                        mimeType={snapshot.selectedUpload.type}
                        fileName={snapshot.selectedUpload.name}
                        alt={snapshot.selectedUpload.name}
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">Ready to upload</div>
                    <div className="text-sm text-muted-foreground">{snapshot.selectedUpload.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatFileSize(snapshot.selectedUpload.size)}
                      {snapshot.selectedUpload.type ? ` • ${snapshot.selectedUpload.type}` : ""}
                    </div>
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleFileSelection(null)}>
                        Clear selection
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </form>

          {snapshot.uploadError ? <p className="text-sm text-destructive">{snapshot.uploadError}</p> : null}

          <div className="space-y-3">
            {show.mediaFiles.length ? (
              show.mediaFiles.map((mediaFile) => (
                <div
                  key={mediaFile.id}
                  className="flex flex-col gap-3 border border-border/70 bg-background/65 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="grid w-full gap-4 lg:grid-cols-[220px_1fr] lg:items-start">
                    <MediaPreview
                      src={`${SERVER_URL}${mediaFile.publicPath}`}
                      mimeType={mediaFile.mimeType}
                      fileName={mediaFile.originalName}
                      alt={mediaFile.originalName}
                    />
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <a
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                          href={`${SERVER_URL}${mediaFile.publicPath}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {mediaFile.originalName}
                        </a>
                        <div className="text-sm text-muted-foreground">
                          {formatFileSize(mediaFile.sizeBytes)}
                          {mediaFile.mimeType ? ` • ${mediaFile.mimeType}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className={buttonVariants({ size: "sm", variant: "outline" })}
                          href={`${SERVER_URL}${mediaFile.publicPath}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open file
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          className="px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void deleteMediaFile(mediaFile.id)}
                          disabled={deletingMediaFileId === mediaFile.id}
                          aria-label={`Delete file ${mediaFile.originalName}`}
                          title="Delete file"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
                No uploaded media yet.
              </div>
            )}
          </div>
        </div>
      </SheetDialog>
    </>
  );
}
