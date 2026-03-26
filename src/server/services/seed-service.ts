import { appDataSource } from "../db/data-source";
import { Project } from "../db/entities/Project";
import { Track } from "../db/entities/Track";
import { createCueWithTrackValues, updateCueTrackValue } from "./cue-service";
import { ensureSeedUser } from "./auth-service";
import { createShowWithDefaultTrack } from "./show-service";
import { CameraColorSetting } from "../db/entities/CameraColorSetting";

export async function seedInitialData() {
  const user = await ensureSeedUser();
  const projectRepository = appDataSource.getRepository(Project);
  const existingProject = await projectRepository.findOne({ where: { name: "Demo Production" } });

  if (existingProject) {
    return;
  }

  const cameraColorRepository = appDataSource.getRepository(CameraColorSetting);
  cameraColorRepository.save(cameraColorRepository.create({ identifier: "1", color: "#ffb700" }));
  cameraColorRepository.save(cameraColorRepository.create({ identifier: "2", color: "#00ffff" }));
  cameraColorRepository.save(cameraColorRepository.create({ identifier: "3", color: "#0d00ff" }));
  cameraColorRepository.save(cameraColorRepository.create({ identifier: "4", color: "#ff0099" }));

  const project = await projectRepository.save(
    projectRepository.create({
      name: "Demo Production",
      description: "Initial seeded project for local development.",
      createdByUserId: user.id,
      createdByUser: user,
    }),
  );

  const show = await createShowWithDefaultTrack(project.id, "Episode 01");
  const cueA = await createCueWithTrackValues(show.id, "Opening slate and camera ready.", 15000);
  const cueB = await createCueWithTrackValues(show.id, "Host intro and live count-in.", 30000);

  const track = await appDataSource.getRepository(Track).findOne({ where: { showId: show.id } });
  if (track) {
    await updateCueTrackValue(cueA.id, track.id, "1");
    await updateCueTrackValue(cueB.id, track.id, "2");
  }
}
