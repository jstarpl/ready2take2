import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SERVER_URL, trpc } from "@/client/lib/trpc";
import { Badge } from "@/client/components/ui/badge";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarShortcut,
  MenubarTrigger,
} from "@/client/components/ui/menubar";
import { Textarea } from "@/client/components/ui/textarea";
import { formatOffset } from "@/client/lib/utils";
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
import { GripVertical, Trash2, Upload } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import type { ShowEvent } from "@/shared/types/domain";

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
    return <img src={src} alt={alt} className="h-28 w-full rounded-xl border border-border/60 object-cover" />;
  }

  if (previewKind === "video") {
    return <video src={src} controls className="h-28 w-full rounded-xl border border-border/60 bg-black object-cover" />;
  }

  if (previewKind === "audio") {
    return <audio src={src} controls className="w-full" preload="metadata" />;
  }

  return (
    <div className="flex h-28 w-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/40 px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
      className={`cursor-pointer grid items-start gap-3 rounded-2xl border border-border/70 bg-background/65 p-3 transition-colors ${leftBorderClass} ${selectedClass}`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <div>
          <div className="font-semibold">{cue.cueOffsetMs !== null ? formatOffset(cue.cueOffsetMs) : ""}</div>
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
        return (
          <Input
            key={track.id}
            value={cueTrackValueDrafts[draftKey] ?? ""}
            placeholder="Technical identifier"
            onChange={(event) => onTrackValueChange(draftKey, event.target.value)}
            onBlur={(event) => onTrackValueBlur(cue, track.id, event.target.value)}
          />
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

export function ShowWorkspace() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const addCueFormRef = useRef<HTMLFormElement | null>(null);
  const addCueCommentRef = useRef<HTMLTextAreaElement | null>(null);
  const [newCueComment, setNewCueComment] = useState("");
  const [newCueOffset, setNewCueOffset] = useState("10000");
  const [newTrackName, setNewTrackName] = useState("");
  const [trackToRemoveId, setTrackToRemoveId] = useState("");
  const [activeModal, setActiveModal] = useState<"addCue" | "addTrack" | "removeTrack" | "media" | null>(null);
  const [cueCommentDrafts, setCueCommentDrafts] = useState<Record<string, string>>({});
  const [cueTrackValueDrafts, setCueTrackValueDrafts] = useState<Record<string, string>>({});
  const [orderedCueIds, setOrderedCueIds] = useState<string[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [deletingMediaFileId, setDeletingMediaFileId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedUploadPreviewUrl = useMemo(() => {
    if (!selectedUpload) {
      return null;
    }

    return URL.createObjectURL(selectedUpload);
  }, [selectedUpload]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const showQuery = trpc.show.getDetail.useQuery(
    { showId: showId ?? "" },
    { enabled: Boolean(showId) },
  );

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
    onSuccess: async () => {
      setNewCueComment("");
      setNewCueOffset("10000");
      setActiveModal(null);
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });

  const createTrackMutation = trpc.track.create.useMutation({
    onSuccess: async () => {
      setNewTrackName("");
      setActiveModal(null);
      if (showId) {
        await utils.show.getDetail.invalidate({ showId });
      }
    },
  });
  const deleteTrackMutation = trpc.track.delete.useMutation({
    onSuccess: async () => {
      setTrackToRemoveId("");
      setActiveModal(null);
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

  const show = showQuery.data;
  const cueById = useMemo(() => new Map((show?.cues ?? []).map((c) => [c.id, c])), [show?.cues]);
  const cueRows = useMemo(
    () => orderedCueIds.flatMap((id) => (cueById.get(id) ? [cueById.get(id)!] : [])),
    [orderedCueIds, cueById],
  );
  const canTake = Boolean(showId && show?.nextCueId && !takeShowMutation.isPending);

  function handleTake() {
    if (!showId || !show?.nextCueId || takeShowMutation.isPending) {
      return;
    }

    takeShowMutation.mutate({ showId });
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
      if (event.code === "F12") {
        event.preventDefault();
        if (!showId || !show?.nextCueId || takeShowMutation.isPending) {
          return;
        }

        handleTake();
        return;
      }

      if (event.ctrlKey && event.altKey && event.code === "Space") {
        event.preventDefault();
        setActiveModal("addCue");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleTake, show?.nextCueId, showId, takeShowMutation.isPending]);

  useEffect(() => {
    if (activeModal !== "addCue") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      addCueCommentRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeModal]);

  useEffect(() => {
    if (!show?.tracks.length) {
      setTrackToRemoveId("");
      return;
    }

    setTrackToRemoveId((current) => {
      if (show.tracks.some((track) => track.id === current)) {
        return current;
      }
      return show.tracks[show.tracks.length - 1]?.id ?? "";
    });
  }, [show?.tracks]);

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
    if (!showId || !selectedUpload) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedUpload);

      const response = await fetch(`${SERVER_URL}/api/shows/${showId}/uploads`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Upload failed.");
      }

      setSelectedUpload(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }

      await utils.show.getDetail.invalidate({ showId });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteMediaFile(mediaFileId: string) {
    if (!showId) {
      return;
    }

    setDeletingMediaFileId(mediaFileId);
    setUploadError(null);

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
      setUploadError(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDeletingMediaFileId(null);
    }
  }

  function handleFileSelection(file: File | null) {
    setUploadError(null);
    setSelectedUpload(file);
  }

  function submitNewCue() {
    const comment = newCueComment.trim();

    if (!showId || !comment || createCueMutation.isPending) {
      return;
    }

    createCueMutation.mutate({
      showId,
      comment,
      cueOffsetMs: newCueOffset ? Number(newCueOffset) : null,
    });
  }

  return (
    <>
      <div className="space-y-6">
        <Card className="bg-card/75">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Menubar>
                <MenubarMenu>
                  <MenubarTrigger>Cue</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => setActiveModal("addCue")}>
                      Add cue
                      <MenubarShortcut>Ctrl+Alt+Space</MenubarShortcut>
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
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Track</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => setActiveModal("addTrack")}>Add track</MenubarItem>
                    <MenubarItem
                      disabled={!show.tracks.length || deleteTrackMutation.isPending}
                      onSelect={() => setActiveModal("removeTrack")}
                    >
                      Remove track
                    </MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Media</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem onSelect={() => setActiveModal("media")}>Open media manager</MenubarItem>
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

        <Card className="bg-card/75">
          <CardHeader>
            <CardTitle>Cue matrix</CardTitle>
            <CardDescription>Each cue is ordered once per show, with a nullable technical identifier for every track.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-[900px] space-y-4">
              <div
                className="gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground grid mx-3"
                style={{ gridTemplateColumns: `150px 180px 220px repeat(${Math.max(show.tracks.length, 1)}, minmax(180px, 1fr)) min-content` }}
              >
                <div className="px-3">Offset</div>
                <div className="px-3">Current / Next</div>
                <div className="px-3">Comment</div>
                {show.tracks.map((track) => (
                  <div key={track.id} className="px-3">{track.name}</div>
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
                        gridTemplateColumns={`150px 180px 220px repeat(${Math.max(show.tracks.length, 1)}, minmax(180px, 1fr)) min-content`}
                        cueCommentDraft={cueCommentDrafts[cue.id] ?? ""}
                        cueTrackValueDrafts={cueTrackValueDrafts}
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
                        isSelected={selectedCueId === cue.id}
                        onSelect={(cueId) => setSelectedCueId(cueId)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </CardContent>
        </Card>

        <ModalDialog
          open={activeModal === "addCue"}
          title="Add cue"
          description="Create a show-level cue across every track."
          onClose={() => setActiveModal(null)}
        >
          <form
            ref={addCueFormRef}
            className="space-y-3"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setActiveModal(null);
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
            <Textarea
              ref={addCueCommentRef}
              value={newCueComment}
              onChange={(event) => setNewCueComment(event.target.value)}
              placeholder="Cue comment"
            />
            <Input value={newCueOffset} onChange={(event) => setNewCueOffset(event.target.value)} placeholder="Offset ms" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newCueComment.trim() || createCueMutation.isPending}>
                Add cue
              </Button>
            </div>
          </form>
        </ModalDialog>

        <ModalDialog
          open={activeModal === "addTrack"}
          title="Add track"
          description="Backfills a technical identifier slot for every existing cue."
          onClose={() => setActiveModal(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!showId) return;
              createTrackMutation.mutate({ showId, name: newTrackName });
            }}
          >
            <Input value={newTrackName} onChange={(event) => setNewTrackName(event.target.value)} placeholder="Track name" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newTrackName.trim() || createTrackMutation.isPending}>
                Add track
              </Button>
            </div>
          </form>
        </ModalDialog>

        <ModalDialog
          open={activeModal === "removeTrack"}
          title="Remove track"
          description="Remove a track and all associated technical identifier values."
          onClose={() => setActiveModal(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!trackToRemoveId) return;
              deleteTrackMutation.mutate({ id: trackToRemoveId });
            }}
          >
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={trackToRemoveId}
              onChange={(event) => setTrackToRemoveId(event.target.value)}
            >
              {show.tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!trackToRemoveId || deleteTrackMutation.isPending}>
                Remove track
              </Button>
            </div>
          </form>
        </ModalDialog>
      </div>
      <SheetDialog
        open={activeModal === "media"}
        title="Media manager"
        description="Upload, preview, and remove show media without leaving the cue workspace."
        onClose={() => setActiveModal(null)}
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
              className={`rounded-2xl border-2 border-dashed p-5 transition ${isDragActive ? "border-primary bg-primary/5" : "border-border/70 bg-background/35"
                }`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!isDragActive) {
                  setIsDragActive(true);
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(false);
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
                  <Button type="submit" disabled={!selectedUpload || isUploading} className="gap-2">
                    <Upload size={16} />
                    {isUploading ? "Uploading..." : "Upload media"}
                  </Button>
                </div>
              </div>

              {selectedUpload ? (
                <div className="mt-4 grid gap-4 rounded-xl border border-border/60 bg-background/55 p-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    {selectedUploadPreviewUrl ? (
                      <MediaPreview
                        src={selectedUploadPreviewUrl}
                        mimeType={selectedUpload.type}
                        fileName={selectedUpload.name}
                        alt={selectedUpload.name}
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">Ready to upload</div>
                    <div className="text-sm text-muted-foreground">{selectedUpload.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatFileSize(selectedUpload.size)}
                      {selectedUpload.type ? ` • ${selectedUpload.type}` : ""}
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

          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

          <div className="space-y-3">
            {show.mediaFiles.length ? (
              show.mediaFiles.map((mediaFile) => (
                <div
                  key={mediaFile.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/65 p-4 lg:flex-row lg:items-center lg:justify-between"
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
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-6 text-sm text-muted-foreground">
                No uploaded media yet.
              </div>
            )}
          </div>
        </div>
      </SheetDialog>
    </>
  );
}
