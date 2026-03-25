import { Navigate, Route, Routes } from "react-router-dom";
import { LoginForm } from "@/client/features/auth/login-form";
import { ProjectShell } from "@/client/features/projects/project-shell";
import { ProjectDetail } from "@/client/features/shows/project-detail";
import { ShowWorkspace } from "@/client/features/shows/show-workspace";
import { trpc } from "@/client/lib/trpc";

export function AppRoutes() {
  const meQuery = trpc.auth.me.useQuery();

  if (meQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!meQuery.data) {
    return <LoginForm />;
  }

  return (
    <Routes>
      <Route path="/" element={<ProjectShell />}>
        <Route index element={<div />} />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
      </Route>
      <Route path="/shows/:showId" element={<ShowWorkspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
