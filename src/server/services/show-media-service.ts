import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { appDataSource } from "../db/data-source";
import { Show } from "../db/entities/Show";
import { ShowMediaFile } from "../db/entities/ShowMediaFile";
import { showEvents } from "../realtime/show-events";

export const uploadsRootDirectory = path.resolve(process.cwd(), "data", "uploads");
export const uploadsTempDirectory = path.join(uploadsRootDirectory, "_tmp");

export function ensureUploadDirectories() {
  fs.mkdirSync(uploadsRootDirectory, { recursive: true });
  fs.mkdirSync(uploadsTempDirectory, { recursive: true });
}

function getShowUploadDirectory(showId: string) {
  return path.join(uploadsRootDirectory, showId);
}

export async function deleteAllShowMediaFiles(showId: string) {
  await fs.promises.rm(getShowUploadDirectory(showId), { recursive: true, force: true });
}

function getPublicUploadPath(showId: string, storedName: string) {
  return `/uploads/${showId}/${storedName}`;
}

function getStoredUploadPath(showId: string, storedName: string) {
  return path.join(getShowUploadDirectory(showId), storedName);
}

async function removeFileIfPresent(filePath: string) {
  await fs.promises.rm(filePath, { force: true });
}

interface IFile {
    /** Name of the file on the uploader's computer. */
    originalname: string;
    /** Value of the `Content-Type` header for this file. */
    mimetype: string;
    /** Size of the file in bytes. */
    size: number;
    /** `DiskStorage` only: Full path to the uploaded file. */
    path: string;
}

export async function createShowMediaFile(showId: string, file: IFile) {
  const showRepository = appDataSource.getRepository(Show);
  const mediaRepository = appDataSource.getRepository(ShowMediaFile);

  try {
    await showRepository.findOneByOrFail({ id: showId });

    const extension = path.extname(file.originalname);
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    const showUploadDirectory = getShowUploadDirectory(showId);
    const finalPath = getStoredUploadPath(showId, storedName);

    await fs.promises.mkdir(showUploadDirectory, { recursive: true });
    await fs.promises.rename(file.path, finalPath);

    const mediaFile = mediaRepository.create({
      showId,
      originalName: file.originalname,
      storedName,
      mimeType: file.mimetype || null,
      sizeBytes: file.size,
      publicPath: getPublicUploadPath(showId, storedName),
    });

    const savedMediaFile = await mediaRepository.save(mediaFile);
    showEvents.publish({ type: "mediaFile.created", showId, entityId: savedMediaFile.id });
    return savedMediaFile;
  } catch (error) {
    await removeFileIfPresent(file.path);
    throw error;
  }
}

export async function deleteShowMediaFile(showId: string, mediaFileId: string) {
  const mediaRepository = appDataSource.getRepository(ShowMediaFile);
  const mediaFile = await mediaRepository.findOneByOrFail({ id: mediaFileId, showId });

  await mediaRepository.delete({ id: mediaFile.id });
  await removeFileIfPresent(getStoredUploadPath(showId, mediaFile.storedName));

  const showUploadDirectory = getShowUploadDirectory(showId);
  const remainingEntries = await fs.promises.readdir(showUploadDirectory).catch(() => [] as string[]);
  if (!remainingEntries.length) {
    await fs.promises.rmdir(showUploadDirectory).catch(() => undefined);
  }

  showEvents.publish({ type: "mediaFile.deleted", showId, entityId: mediaFile.id });
  return mediaFile;
}
