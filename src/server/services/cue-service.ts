import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { CueTrackValue } from "../db/entities/CueTrackValue";
import { Show } from "../db/entities/Show";
import { Track } from "../db/entities/Track";
import { showEvents } from "../realtime/show-events";

const REQUIRED_CUE_IMPORT_HEADERS = ["Marker Name", "In"] as const;

interface ParsedCueImportRow {
  comment: string;
  cueOffsetMs: number | null;
  technicalIdentifiers: Array<string | null>;
}

function parseCsvDocument(csvContent: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let index = 0;
  let inQuotes = false;

  while (index < csvContent.length) {
    const character = csvContent[index];

    if (inQuotes) {
      if (character === '"') {
        if (csvContent[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      field += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";

      if (character === "\r" && csvContent[index + 1] === "\n") {
        index += 2;
      } else {
        index += 1;
      }

      continue;
    }

    field += character;
    index += 1;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCueOffsetMs(rawValue: string, rowNumber: number): number | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const numericValue = Number(trimmedValue);
  if (Number.isFinite(numericValue)) {
    return Math.max(0, Math.round(numericValue * 1000));
  }

  const normalizedValue = trimmedValue.replace(/,/g, ".");
  const parts = normalizedValue.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Row ${rowNumber}: unsupported In value \"${rawValue}\".`);
  }

  const seconds = Number(parts[parts.length - 1]);
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if ([hours, minutes, seconds].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Row ${rowNumber}: unsupported In value \"${rawValue}\".`);
  }

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

function parseCueImportRows(csvContent: string, trackCount: number): ParsedCueImportRow[] {
  const rows = parseCsvDocument(csvContent);
  if (rows.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const headerRow = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim());
  const headerIndexByName = new Map(headerRow.map((header, index) => [header.toLowerCase(), index]));
  const missingHeaders = REQUIRED_CUE_IMPORT_HEADERS.filter((header) => !headerIndexByName.has(header.toLowerCase()));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingHeaders.join(", ")}.`);
  }

  const markerNameIndex = headerIndexByName.get("marker name")!;
  const inIndex = headerIndexByName.get("in")!;
  const parsedRows: ParsedCueImportRow[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((value) => value.trim() === "")) {
      continue;
    }

    const rowNumber = index + 1;
    const rawMarkerName = row[markerNameIndex] ?? "";
    const markerSegments = rawMarkerName.split(";");
    const comment = (markerSegments.shift() ?? "").trim();
    const technicalIdentifiers = markerSegments.map((value) => {
      const trimmedValue = value.trim();
      return trimmedValue === "" ? null : trimmedValue;
    });

    if (technicalIdentifiers.length > trackCount) {
      throw new Error(
        `Row ${rowNumber}: found ${technicalIdentifiers.length} technical identifiers after semicolons, but the show has only ${trackCount} tracks.`,
      );
    }

    parsedRows.push({
      comment,
      cueOffsetMs: parseCueOffsetMs(row[inIndex] ?? "", rowNumber),
      technicalIdentifiers,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("CSV does not contain any cue rows.");
  }

  return parsedRows;
}

export async function createCueWithTrackValues(showId: string, comment: string, cueOffsetMs: number | null, explicitCueId?: string) {
  return appDataSource.transaction(async (manager) => {
    const show = await manager.findOneByOrFail(Show, { id: showId });
    const cueRepository = manager.getRepository(Cue);
    const cueTrackValueRepository = manager.getRepository(CueTrackValue);
    const tracks = await manager.findBy(Track, { showId });
    const existingCues = await cueRepository.find({ where: { showId } });
    const cueCount = existingCues.length;

    let resolvedCueId: string;
    if (explicitCueId && explicitCueId.trim() !== "") {
      resolvedCueId = explicitCueId.trim();
    } else {
      const maxCueId = existingCues.reduce((max, cue) => {
        const num = parseInt(cue.cueId, 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      resolvedCueId = String(maxCueId + 1);
    }

    const cue = cueRepository.create({
      show,
      showId,
      cueId: resolvedCueId,
      comment,
      cueOffsetMs: cueOffsetMs ?? undefined,
      orderKey: String(cueCount).padStart(4, "0"),
    });

    const savedCue = await cueRepository.save(cue);

    if (tracks.length > 0) {
      await cueTrackValueRepository.save(
        tracks.map((track) =>
          cueTrackValueRepository.create({
            cueId: savedCue.id,
            trackId: track.id,
            technicalIdentifier: null,
          }),
        ),
      );
    }

    showEvents.publish({ type: "cue.created", showId, entityId: savedCue.id });
    return savedCue;
  });
}

export async function importCuesFromCsv(showId: string, csvContent: string) {
  return appDataSource.transaction(async (manager) => {
    await manager.findOneByOrFail(Show, { id: showId });

    const cueRepository = manager.getRepository(Cue);
    const cueTrackValueRepository = manager.getRepository(CueTrackValue);
    const trackRepository = manager.getRepository(Track);

    const [existingCues, tracks] = await Promise.all([
      cueRepository.find({ where: { showId } }),
      trackRepository.find({ where: { showId }, order: { position: "ASC" } }),
    ]);

    const parsedRows = parseCueImportRows(csvContent, tracks.length);
    const cueCount = existingCues.length;
    const maxCueId = existingCues.reduce((max, cue) => {
      const numericCueId = parseInt(cue.cueId, 10);
      return Number.isNaN(numericCueId) ? max : Math.max(max, numericCueId);
    }, 0);

    const cuesToSave = parsedRows.map((row, index) =>
      cueRepository.create({
        showId,
        cueId: String(maxCueId + index + 1),
        comment: row.comment,
        cueOffsetMs: row.cueOffsetMs ?? undefined,
        orderKey: String(cueCount + index).padStart(4, "0"),
      }),
    );

    const savedCues = await cueRepository.save(cuesToSave);

    if (tracks.length > 0) {
      const cueTrackValuesToSave = savedCues.flatMap((cue, cueIndex) =>
        tracks.map((track, trackIndex) =>
          cueTrackValueRepository.create({
            cueId: cue.id,
            trackId: track.id,
            technicalIdentifier: parsedRows[cueIndex]?.technicalIdentifiers[trackIndex] ?? null,
          }),
        ),
      );

      if (cueTrackValuesToSave.length > 0) {
        await cueTrackValueRepository.save(cueTrackValuesToSave);
      }
    }

    showEvents.publish({ type: "cue.imported", showId });
    return { importedCueCount: savedCues.length };
  });
}

export async function reorderCues(showId: string, cueIds: string[]) {
  return appDataSource.transaction(async (manager) => {
    const cueRepository = manager.getRepository(Cue);
    const cues = await cueRepository.findBy({ showId });
    const byId = new Map(cues.map((cue) => [cue.id, cue]));

    cueIds.forEach((cueId, index) => {
      const cue = byId.get(cueId);
      if (cue) {
        cue.orderKey = String(index).padStart(4, "0");
      }
    });

    await cueRepository.save(Array.from(byId.values()));
    showEvents.publish({ type: "cue.reordered", showId });
  });
}

export async function updateCue(cueId: string, comment: string, cueOffsetMs: number | null) {
  const cueRepository = appDataSource.getRepository(Cue);
  const cue = await cueRepository.findOneByOrFail({ id: cueId });

  cue.comment = comment;
  cue.cueOffsetMs = cueOffsetMs;

  const saved = await cueRepository.save(cue);
  showEvents.publish({ type: "cue.updated", showId: cue.showId, entityId: saved.id });
  return saved;
}

export async function updateCueTrackValue(cueId: string, trackId: string, technicalIdentifier: string | null) {
  const cueRepository = appDataSource.getRepository(Cue);
  const trackRepository = appDataSource.getRepository(Track);
  const cueTrackValueRepository = appDataSource.getRepository(CueTrackValue);

  const cue = await cueRepository.findOneByOrFail({ id: cueId });
  const track = await trackRepository.findOneByOrFail({ id: trackId });

  if (cue.showId !== track.showId) {
    throw new Error("Cue and track must belong to the same show.");
  }

  const existing = await cueTrackValueRepository.findOne({ where: { cueId, trackId } });

  if (!existing) {
    const created = cueTrackValueRepository.create({ cueId, trackId, technicalIdentifier });
    const saved = await cueTrackValueRepository.save(created);
    showEvents.publish({ type: "cueTrackValue.updated", showId: cue.showId, entityId: saved.id });
    return saved;
  }

  existing.technicalIdentifier = technicalIdentifier;
  const saved = await cueTrackValueRepository.save(existing);
  showEvents.publish({ type: "cueTrackValue.updated", showId: cue.showId, entityId: saved.id });
  return saved;
}

export async function resetCueIds(showId: string) {
  return appDataSource.transaction(async (manager) => {
    const cueRepository = manager.getRepository(Cue);
    const cues = await cueRepository.find({ where: { showId }, order: { orderKey: "ASC" } });

    cues.forEach((cue, index) => {
      cue.cueId = String(index + 1);
    });

    await cueRepository.save(cues);
    showEvents.publish({ type: "cue.reordered", showId });
  });
}

export async function deleteCueAndClearPointers(cueId: string) {
  await appDataSource.transaction(async (manager) => {
    const cueRepository = manager.getRepository(Cue);
    const showRepository = manager.getRepository(Show);
    const cue = await cueRepository.findOneByOrFail({ id: cueId });
    const show = await showRepository.findOneByOrFail({ id: cue.showId });

    if (show.currentCueId === cueId) {
      show.currentCueId = null;
    }

    if (show.nextCueId === cueId) {
      show.nextCueId = null;
    }

    await showRepository.save(show);
    await cueRepository.delete({ id: cueId });

    showEvents.publish({ type: "cue.deleted", showId: show.id, entityId: cueId });
  });
}
