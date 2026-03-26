import { createTRPCRouter, protectedProcedure } from "../trpc";
import { cameraColorSettingDeleteSchema, cameraColorSettingUpsertSchema } from "@/shared/schemas";
import { appDataSource } from "../../db/data-source";
import { CameraColorSetting } from "../../db/entities/CameraColorSetting";

export const cameraColorSettingRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    return appDataSource.getRepository(CameraColorSetting).find({
      order: { identifier: "ASC" },
    });
  }),

  upsert: protectedProcedure.input(cameraColorSettingUpsertSchema).mutation(async ({ input }) => {
    const repo = appDataSource.getRepository(CameraColorSetting);
    const existing = await repo.findOneBy({ identifier: input.identifier });
    if (existing) {
      existing.color = input.color;
      return repo.save(existing);
    }
    const setting = repo.create({ identifier: input.identifier, color: input.color });
    return repo.save(setting);
  }),

  delete: protectedProcedure.input(cameraColorSettingDeleteSchema).mutation(async ({ input }) => {
    const repo = appDataSource.getRepository(CameraColorSetting);
    await repo.delete({ id: input.id });
    return { success: true };
  }),
});
