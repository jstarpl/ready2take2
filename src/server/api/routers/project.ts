import { createTRPCRouter, protectedProcedure } from "../trpc";
import { projectCreateSchema, projectIdSchema, projectImportSchema } from "@/shared/schemas";
import { appDataSource } from "../../db/data-source";
import { Project } from "../../db/entities/Project";
import { exportProjectHierarchy, importProjectHierarchy } from "../../services/project-transfer-service";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    return appDataSource.getRepository(Project).find({
      relations: { shows: true },
      order: { createdAt: "DESC", shows: { orderKey: "ASC" } },
    });
  }),
  create: protectedProcedure.input(projectCreateSchema).mutation(async ({ ctx, input }) => {
    const projectRepository = appDataSource.getRepository(Project);
    const project = projectRepository.create({
      name: input.name,
      description: input.description ?? null,
      createdByUserId: ctx.user.id,
      createdByUser: ctx.user,
    });

    return projectRepository.save(project);
  }),
  getById: protectedProcedure.input(projectIdSchema).query(async ({ input }) => {
    return appDataSource.getRepository(Project).findOne({
      where: { id: input.projectId },
      relations: { shows: true },
      order: { shows: { orderKey: "ASC" } },
    });
  }),
  exportHierarchy: protectedProcedure.input(projectIdSchema).mutation(async ({ input }) => {
    return exportProjectHierarchy(input.projectId);
  }),
  importHierarchy: protectedProcedure.input(projectImportSchema).mutation(async ({ ctx, input }) => {
    return importProjectHierarchy(input.payload, ctx.user.id);
  }),
});
