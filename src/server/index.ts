import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { appDataSource } from "./db/data-source";
import { appRouter } from "./api/root";
import { createContext } from "./api/trpc";
import { SESSION_COOKIE_NAME } from "./auth/constants";
import { getSessionUser } from "./services/auth-service";
import { createShowMediaFile, deleteShowMediaFile, ensureUploadDirectories, uploadsTempDirectory, uploadsRootDirectory } from "./services/show-media-service";
import { seedInitialData } from "./services/seed-service";
import { shutdownVideoMixerConnections } from "./services/video-mixer-service";

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  fs.mkdirSync(path.resolve(process.cwd(), "data"), { recursive: true });
  ensureUploadDirectories();
  await appDataSource.initialize();
  await seedInitialData();

  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const upload = multer({
    dest: uploadsTempDirectory,
    limits: {
      fileSize: 1024 * 1024 * 1024, // 1 GB
    },
  });

  async function requireAuthenticatedUser(
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) {
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const user = await getSessionUser(sessionId);

    if (!user) {
      response.status(401).json({ message: "Unauthorized" });
      return;
    }

    next();
  }

  app.use("/uploads", express.static(uploadsRootDirectory));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/shows/:showId/uploads", requireAuthenticatedUser, (request, response) => {
    upload.single("file")(request, response, async (error) => {
      const showId = Array.isArray(request.params.showId) ? request.params.showId[0] : request.params.showId;

      if (error) {
        response.status(400).json({ message: error.message });
        return;
      }

      if (!request.file) {
        response.status(400).json({ message: "No file was uploaded." });
        return;
      }

      try {
        const mediaFile = await createShowMediaFile(showId, request.file);
        response.status(201).json(mediaFile);
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "Upload failed.";
        response.status(400).json({ message });
      }
    });
  });

  app.delete("/api/shows/:showId/uploads/:mediaFileId", requireAuthenticatedUser, async (request, response) => {
    const showId = Array.isArray(request.params.showId) ? request.params.showId[0] : request.params.showId;
    const mediaFileId = Array.isArray(request.params.mediaFileId) ? request.params.mediaFileId[0] : request.params.mediaFileId;

    try {
      await deleteShowMediaFile(showId, mediaFileId);
      response.status(204).end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      response.status(400).json({ message });
    }
  });

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const server = app.listen(PORT, () => {
    console.log(`Ready2Take2 server listening on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: "/trpc" });
  applyWSSHandler({
    wss,
    router: appRouter,
    createContext: async (options) => {
      const request = options.req as express.Request;
      const response = {} as express.Response;
      request.cookies = Object.fromEntries(
        (request.headers.cookie ?? "")
          .split(";")
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .map((chunk) => {
            const [key, ...rest] = chunk.split("=");
            return [key, decodeURIComponent(rest.join("="))];
          }),
      );
      return createContext({ req: request, res: response });
    },
  });

  let shutdownStarted = false;
  const shutdown = async (signal: string) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    console.log(`Shutting down Ready2Take2 server (${signal})`);

    await shutdownVideoMixerConnections().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[video-mixer] Failed during shutdown cleanup: ${message}`);
    });

    wss.close();
    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 5000).unref();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
