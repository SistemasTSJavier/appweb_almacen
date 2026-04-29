import { Navigate, Outlet } from "react-router-dom";
import { useSessionStore } from "../state/use-session-store";
import type { AppRole } from "../types/models";

export function RequireSession() {
  const user = useSessionStore((s) => s.currentUser);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ allowed }: { allowed: AppRole[] }) {
  const hasRole = useSessionStore((s) => s.hasRole);
  if (!hasRole(allowed)) return <Navigate to="/inventario" replace />;
  return <Outlet />;
}
