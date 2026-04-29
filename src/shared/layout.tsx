import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "../services/auth-service";
import { useSessionStore } from "../state/use-session-store";

const links = [
  { to: "/dashboard", label: "Dashboard", adminOnly: true },
  { to: "/inventario", label: "Inventario" },
  { to: "/operaciones", label: "Operaciones" },
  { to: "/colaboradores", label: "Colaboradores" },
  { to: "/pedidos", label: "Pedidos" },
  { to: "/conteo-ciclico", label: "Conteo Ciclico" },
];

export function AppLayout() {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const logoWebpUrl = `${import.meta.env.BASE_URL}logo.webp`;
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.currentUser);
  const setCurrentUser = useSessionStore((s) => s.setCurrentUser);
  const isAdmin = user?.role === "admin";
  const visibleLinks = links.filter((item) => !item.adminOnly || isAdmin);
  const [menuOpen, setMenuOpen] = useState(false);

  const onSignOut = async () => {
    await signOut();
    setCurrentUser(null);
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <img
          src={logoUrl}
          alt="Logo empresa"
          className="sidebar-logo"
          onError={(event) => {
            if (event.currentTarget.dataset.fallbackApplied === "true") {
              event.currentTarget.style.display = "none";
              return;
            }
            event.currentTarget.dataset.fallbackApplied = "true";
            event.currentTarget.src = logoWebpUrl;
          }}
        />
        <h2>TACTICAL SUPPORT</h2>
        <p>{user?.fullName}</p>
        <p className="muted">"VIVE EL HABITO DE LA EXCELENCIA"</p>
        <nav>
          {visibleLinks.map((item) => (
            <NavLink key={item.to} to={item.to} className="link" onClick={() => setMenuOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={onSignOut}>Cerrar sesion</button>
      </aside>
      <main className="content">
        <header>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Abrir menu"
          >
            Menu
          </button>
          <Link to={isAdmin ? "/dashboard" : "/inventario"}>Control Operativo</Link>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
