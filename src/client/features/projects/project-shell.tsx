import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Badge } from "@/client/components/ui/badge";

export function ProjectShell() {
  const navigate = useNavigate();
  const params = useParams();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const projectsQuery = trpc.project.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
  });
  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: async (project) => {
      setName("");
      setDescription("");
      await utils.project.list.invalidate();
      navigate(`/projects/${project.id}`);
    },
  });

  const selectedProject = useMemo(
    () => projectsQuery.data?.find((project) => project.id === params.projectId) ?? null,
    [projectsQuery.data, params.projectId],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <Card className="self-start bg-card/75">
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Projects</CardTitle>
                <CardDescription>Manage productions and jump into live shows.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => logoutMutation.mutate()}>
                Logout
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createProjectMutation.mutate({ name, description });
              }}
            >
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New project name" />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short description"
              />
              <Button className="w-full" type="submit" disabled={createProjectMutation.isPending || !name.trim()}>
                Create project
              </Button>
            </form>

            <div className="space-y-3">
              {projectsQuery.data?.map((project) => (
                <Link
                  key={project.id}
                  className="block border border-border/60 bg-background/60 p-4 transition hover:border-primary/40 hover:bg-background"
                  to={`/projects/${project.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{project.name}</div>
                      <div className="text-sm text-muted-foreground">{project.description ?? "No description"}</div>
                    </div>
                    <Badge>{project.shows.length} shows</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedProject ? (
            <Outlet context={{ project: selectedProject }} />
          ) : (
            <Card className="bg-card/75">
              <CardHeader>
                <CardTitle>Select a project</CardTitle>
                <CardDescription>Choose an existing production or create a new one to begin.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
