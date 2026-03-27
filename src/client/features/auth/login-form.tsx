import { useState } from "react";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";

export function LoginForm() {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState(window.localStorage.getItem("lastUsername") || "admin");
  const [password, setPassword] = useState("");
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      window.localStorage.setItem("lastUsername", data.username);
      await utils.auth.me.invalidate();
      await utils.project.list.invalidate();
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Ready2Take2</CardTitle>
          <CardDescription>Sign in to coordinate live cues and show state.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              loginMutation.mutate({ username, password });
            }}
          >
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
            <Input
              value={password}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            {loginMutation.error ? <p className="text-sm text-red-600">{loginMutation.error.message}</p> : null}
            <Button className="w-full" type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
