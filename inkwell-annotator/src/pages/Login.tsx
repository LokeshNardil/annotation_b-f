import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type StoredAuth = {
  token: string;
  projectId: string;
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
};

const STORAGE_KEY = "inkwell-auth";
const DEFAULT_PROJECT_ID = "demo-project";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

const Login = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as StoredAuth;
      setStoredAuth(parsed);
      if (parsed.projectId) {
        setProjectId(parsed.projectId);
      }
    } catch (error) {
      console.error("Failed to parse stored auth user", error);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const displayName = useMemo(() => {
    if (!storedAuth?.user) return null;
    const { first_name, last_name, username, email } = storedAuth.user;
    if (first_name || last_name) {
      return [first_name, last_name].filter(Boolean).join(" ");
    }
    return username ?? email ?? storedAuth.user.id;
  }, [storedAuth]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
          project_id: projectId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.detail ?? "Unable to sign in with the provided credentials.";
        throw new Error(message);
      }

      const data = (await response.json()) as StoredAuth & { project_id: string };
      const authPayload: StoredAuth = {
        token: data.token,
        projectId: data.projectId ?? data.project_id ?? projectId,
        user: data.user,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authPayload));
      }

      setStoredAuth(authPayload);
      setStatusMessage("Successfully signed in. Redirecting to annotator…");
      setIdentifier("");
      setPassword("");

      const navigateProjectId = authPayload.projectId ?? projectId ?? DEFAULT_PROJECT_ID;
      window.setTimeout(() => {
        navigate(`/annotate?projectId=${encodeURIComponent(navigateProjectId)}`, { replace: true });
      }, 800);
    } catch (err) {
      console.error("Login failed", err);
      setError(err instanceof Error ? err.message : "Unexpected error while trying to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setStatusMessage("You have logged out.");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setStoredAuth(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Sign in to Inkwell Annotator</h1>
          <p className="text-muted-foreground text-lg">
            Use your Nardil account (email or username) and password. Tokens are generated automatically so remote
            cursors and selections are tracked in real time.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          <Card className="shadow-lg">
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>Enter your account details to receive a realtime collaboration token.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email or Username</Label>
                  <Input
                    id="identifier"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project">Project ID</Label>
                  <Input
                    id="project"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    placeholder="demo-project"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Login failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {statusMessage && !error && (
                  <Alert>
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{statusMessage}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3 md:flex-row">
                <Button type="submit" className={cn("w-full md:w-auto", loading && "opacity-90")} disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full md:w-auto"
                  onClick={() => navigate("/annotate")}
                >
                  Go to annotator
                </Button>
                {storedAuth && (
                  <Button type="button" variant="outline" className="w-full md:w-auto" onClick={handleLogout}>
                    Logout
                  </Button>
                )}
              </CardFooter>
            </form>
          </Card>

          {storedAuth && (
            <div className="mt-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Active session for{" "}
                <span className="font-medium text-foreground">{displayName ?? storedAuth.user.id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Project: <span className="font-medium">{storedAuth.projectId}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

