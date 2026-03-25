import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";

type ProjectContext = {
  project: {
    id: string;
    name: string;
    description: string | null;
    shows: Array<{ id: string; name: string; status: string }>;
  };
};

export function ProjectDetail() {
  const navigate = useNavigate();
  const { project } = useOutletContext<ProjectContext>();
  const utils = trpc.useUtils();
  const [showName, setShowName] = useState("");
  const createShowMutation = trpc.show.create.useMutation({
    onSuccess: async (show) => {
      setShowName("");
      await utils.project.list.invalidate();
      await utils.project.getById.invalidate({ projectId: project.id });
      navigate(`/shows/${show.id}`);
    },
  });

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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {project.shows.map((show) => (
              <Link key={show.id} to={`/shows/${show.id}`}>
                <Card className="h-full bg-background/70 transition hover:border-primary/50">
                  <CardHeader>
                    <CardTitle>{show.name}</CardTitle>
                    <CardDescription>Status: {show.status}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
