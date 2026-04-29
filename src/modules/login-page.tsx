import { useState } from "react";
import { useNavigate } from "react-router-dom";
import companyLogo from "../assets/company-logo.webp";
import { signIn } from "../services/auth-service";
import { useSessionStore } from "../state/use-session-store";

export function LoginPage() {
  const navigate = useNavigate();
  const setCurrentUser = useSessionStore((s) => s.setCurrentUser);
  const [email, setEmail] = useState("sistemas@tacticalsupport.com.mx");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const user = await signIn(email, password);
      setCurrentUser(user);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesion");
    }
  };

  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <div className="auth-logo-panel">
          <img src={companyLogo} alt="Logo empresa" className="auth-logo" width={280} height={80} decoding="async" />
        </div>
        <h1 className="auth-title">TACTICAL SUPPORT  ALMACEN</h1>
        <p className="auth-subtitle">Acceso a plataforma de control de inventario</p>
        <form onSubmit={onSubmit}>
          <label>Correo</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Contrasena</label>
          <div className="auth-password-row">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShowPassword((prev) => !prev)}>
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">Entrar</button>
        </form>
      </section>
    </div>
  );
}
