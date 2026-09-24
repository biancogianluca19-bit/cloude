import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, NavLink, Link, useNavigate, useParams, useLocation, Outlet } from "react-router-dom";
import {
  Home as HomeIcon,
  LayoutDashboard,
  Timer,
  Dumbbell,
  MessageCircle,
  Network,
  FolderOpen,
  GraduationCap,
  CalendarClock,
  Layers,
  Bug,
  Gauge,
  Settings,
  Moon,
  Sun,
  Search,
  MoreHorizontal,
  FileCheck2,
  Command,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { api, useApi, useOnChange } from "./api";
import { Modal, Kbd, useIsMobile } from "./ui";
import { HomePage } from "./pages/Home";
import { SettingsPage } from "./pages/Settings";
import { TodayPage } from "./pages/Today";
import { MaterialPage } from "./pages/Material";
import { ProfilePage } from "./pages/Profile";
import { ExamPage } from "./pages/Exam";
import { PracticePage, ExercisePage } from "./pages/Practice";
import { MocksPage, MockPage } from "./pages/Mocks";
import { TutorPage } from "./pages/Tutor";
import { MapPage, TopicPage } from "./pages/Map";
import { FlashcardsPage } from "./pages/Flashcards";
import { ErrorsPage } from "./pages/Errors";
import { VerdictPage } from "./pages/Verdict";
import { StudyPage } from "./pages/Study";
import { SubjectSettingsPage } from "./pages/SubjectSettings";

export function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "light");
  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("forja-theme", next);
    } catch {
      /* sin almacenamiento */
    }
    setTheme(next);
  }, [theme]);
  return { theme, toggle };
}

const SUBJECT_NAV = [
  { to: "", label: "Hoy", icon: LayoutDashboard, key: "h", end: true },
  { to: "estudiar", label: "Sesión de estudio", icon: Timer, key: "s" },
  { to: "practicar", label: "Practicar", icon: Dumbbell, key: "p" },
  { to: "simulacros", label: "Simulacros", icon: FileCheck2, key: "x" },
  { to: "tutor", label: "Tutor", icon: MessageCircle, key: "t" },
  { to: "tarjetas", label: "Tarjetas", icon: Layers, key: "f" },
  { to: "mapa", label: "Mapa de temas", icon: Network, key: "m" },
  { to: "errores", label: "Errores", icon: Bug, key: "e" },
  { to: "aprobar", label: "¿Estoy para aprobar?", icon: Gauge, key: "a" },
  { to: "examen", label: "Examen y plan", icon: CalendarClock, key: "k" },
  { to: "profesor", label: "Perfil del profesor", icon: GraduationCap, key: "o" },
  { to: "material", label: "Material", icon: FolderOpen, key: "u" },
];

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="/m/:sid" element={<SubjectOutlet />}>
          <Route index element={<TodayPage />} />
          <Route path="estudiar" element={<StudyPage />} />
          <Route path="practicar" element={<PracticePage />} />
          <Route path="ejercicio/:eid" element={<ExercisePage />} />
          <Route path="simulacros" element={<MocksPage />} />
          <Route path="simulacro/:mid" element={<MockPage />} />
          <Route path="tutor" element={<TutorPage />} />
          <Route path="tarjetas" element={<FlashcardsPage />} />
          <Route path="mapa" element={<MapPage />} />
          <Route path="tema/:tid" element={<TopicPage />} />
          <Route path="errores" element={<ErrorsPage />} />
          <Route path="aprobar" element={<VerdictPage />} />
          <Route path="examen" element={<ExamPage />} />
          <Route path="profesor" element={<ProfilePage />} />
          <Route path="material" element={<MaterialPage />} />
          <Route path="config" element={<SubjectSettingsPage />} />
        </Route>
        <Route path="*" element={<div className="content"><h1>No existe esta página</h1><Link to="/" className="btn mt-16">Volver</Link></div>} />
      </Route>
    </Routes>
  );
}

function SubjectOutlet() {
  return <Outlet />;
}

function currentSid(pathname: string): string | null {
  return /^\/m\/(\d+)/.exec(pathname)?.[1] ?? null;
}

function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const sid = currentSid(loc.pathname);
  const { theme, toggle } = useTheme();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const subject = useApi<any>(sid ? `/api/subjects/${sid}` : null);
  const status = useApi<any>("/api/status");
  const alerts = useApi<any[]>(sid ? `/api/subjects/${sid}/alerts` : null);
  useOnChange(useCallback(() => alerts.reload(), [alerts.reload]));
  const pending = (alerts.data ?? []).filter((a) => a.decision === "pendiente" && a.severity === "alto").length;
  const isMobile = useIsMobile();

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMore(false);
  }, [loc.pathname]);

  // Atajos: ⌘K paleta, "g" + letra para navegar, "?" ayuda.
  const gPressed = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        setHelp(true);
        return;
      }
      if (e.key === "g") {
        gPressed.current = Date.now();
        return;
      }
      if (Date.now() - gPressed.current < 900) {
        gPressed.current = 0;
        if (e.key === "i") return nav("/");
        if (e.key === ",") return nav("/ajustes");
        const item = SUBJECT_NAV.find((n) => n.key === e.key);
        if (item && sid) nav(`/m/${sid}/${item.to}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, sid]);

  const title = subject.data?.name;
  const here = SUBJECT_NAV.find((n) => (n.to ? loc.pathname.startsWith(`/m/${sid}/${n.to}`) : loc.pathname === `/m/${sid}`));

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Sparkles size={13} />
          </span>
          FORJA
        </Link>
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          <HomeIcon /> Materias
        </NavLink>
        <button className="nav-item" style={{ border: 0, background: "none", cursor: "pointer", textAlign: "left" }} onClick={() => setPalette(true)}>
          <Search /> Buscar y saltar <span className="count">⌘K</span>
        </button>
        {sid && (
          <>
            <div className="nav-section" title={title}>
              {title ? (title.length > 26 ? title.slice(0, 25) + "…" : title) : "…"}
            </div>
            {SUBJECT_NAV.map((n) => (
              <NavLink key={n.to} to={`/m/${sid}/${n.to}`} end={n.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <n.icon /> {n.label}
                {n.to === "material" && pending > 0 && <span className="dot" title={`${pending} alerta(s) de seguridad sin revisar`} />}
              </NavLink>
            ))}
          </>
        )}
        <div className="sidebar-foot">
          {status.data && (
            <div className="nav-item" style={{ cursor: "default" }} title={status.data.ai ? `Modelo: ${status.data.model}` : "Sin API key: funciones de IA en modo demo"}>
              <span className="dot" style={{ margin: 0, background: status.data.ai ? "var(--ok)" : "var(--warn)" }} />
              {status.data.ai ? "IA conectada" : "Modo demo (sin IA)"}
            </div>
          )}
          <NavLink to="/ajustes" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Settings /> Ajustes
          </NavLink>
          <button className="nav-item" style={{ border: 0, background: "none", cursor: "pointer" }} onClick={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <button className="nav-item" style={{ border: 0, background: "none", cursor: "pointer" }} onClick={() => setHelp(true)}>
            <Command /> Atajos <span className="count">?</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
          {isMobile && sid && loc.pathname !== `/m/${sid}` ? (
            <button className="btn ghost icon" onClick={() => nav(-1)} aria-label="Volver">
              <ChevronLeft />
            </button>
          ) : null}
          <div className="crumbs grow">
            {!sid ? (
              <span className="here">{loc.pathname === "/ajustes" ? "Ajustes" : "Materias"}</span>
            ) : (
              <>
                <Link to="/" className="hide-mobile">
                  Materias
                </Link>
                <span className="sep hide-mobile">/</span>
                <Link to={`/m/${sid}`} className={here && here.to ? "hide-mobile" : "here"}>
                  {title ?? "…"}
                </Link>
                {here && here.to && (
                  <>
                    <span className="sep hide-mobile">/</span>
                    <span className="here">{here.label}</span>
                  </>
                )}
              </>
            )}
          </div>
          <button className="btn ghost icon show-mobile" onClick={() => setPalette(true)} aria-label="Buscar">
            <Search />
          </button>
          <button className="btn ghost icon show-mobile" onClick={toggle} aria-label="Cambiar tema">
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
          <button className="btn sm hide-mobile" onClick={() => setPalette(true)}>
            <Search /> Buscar <Kbd>⌘K</Kbd>
          </button>
        </header>
        <Outlet />
      </div>

      {sid && (
        <nav className="mobile-tabs" aria-label="Navegación">
          {[SUBJECT_NAV[0], SUBJECT_NAV[2], SUBJECT_NAV[4], SUBJECT_NAV[6]].map((n) => (
            <NavLink key={n.to} to={`/m/${sid}/${n.to}`} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.icon />
              {n.label === "Mapa de temas" ? "Mapa" : n.label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className={more ? "active" : ""}>
            <MoreHorizontal />
            Más
            {pending > 0 && <span className="dot" style={{ position: "absolute", marginLeft: 16, background: "var(--bad)", width: 6, height: 6 }} />}
          </button>
        </nav>
      )}
      <Modal open={more} onClose={() => setMore(false)} title={title ?? "Más"}>
        <div className="list">
          {SUBJECT_NAV.filter((_, i) => ![0, 2, 4, 6].includes(i)).map((n) => (
            <Link key={n.to} to={`/m/${sid}/${n.to}`} className="list-item" style={{ padding: "12px 4px" }}>
              <n.icon size={18} /> {n.label}
              {n.to === "material" && pending > 0 && <span className="badge bad" style={{ marginLeft: "auto" }}>{pending} alerta(s)</span>}
            </Link>
          ))}
          <Link to="/" className="list-item" style={{ padding: "12px 4px" }}>
            <HomeIcon size={18} /> Todas las materias
          </Link>
          <Link to="/ajustes" className="list-item" style={{ padding: "12px 4px" }}>
            <Settings size={18} /> Ajustes
          </Link>
        </div>
      </Modal>
      <Palette open={palette} onClose={() => setPalette(false)} sid={sid} />
      <Modal open={help} onClose={() => setHelp(false)} title="Atajos de teclado">
        <div className="col gap-6">
          <ShortcutRow k={["⌘", "K"]} label="Buscar, saltar a una pantalla o preguntar al tutor" />
          <ShortcutRow k={["g", "i"]} label="Ir a Materias" />
          {SUBJECT_NAV.map((n) => (
            <ShortcutRow key={n.key} k={["g", n.key]} label={n.label} />
          ))}
          <ShortcutRow k={["h"]} label="En un ejercicio: pedir la siguiente pista" />
          <ShortcutRow k={["⌘", "Enter"]} label="Entregar el ejercicio o enviar al tutor" />
          <ShortcutRow k={["Espacio"]} label="En tarjetas: dar vuelta · 1–4 para calificar" />
        </div>
      </Modal>
    </div>
  );
}

function ShortcutRow({ k, label }: { k: string[]; label: string }) {
  return (
    <div className="row between small" style={{ padding: "4px 0" }}>
      <span className="muted">{label}</span>
      <span className="row gap-4">
        {k.map((x) => (
          <Kbd key={x}>{x}</Kbd>
        ))}
      </span>
    </div>
  );
}

function Palette({ open, onClose, sid }: { open: boolean; onClose: () => void; sid: string | null }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<any[]>([]);
  const subjects = useApi<any[]>(open ? "/api/subjects" : null);
  const topics = useApi<any>(open && sid ? `/api/subjects/${sid}/topics` : null);
  useEffect(() => {
    if (!open) {
      setQ("");
      setSel(0);
      setHits([]);
    }
  }, [open]);
  useEffect(() => {
    if (!sid || q.trim().length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => api.get(`/api/subjects/${sid}/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.slice(0, 5))).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q, sid]);

  const items = useMemo(() => {
    const out: { label: string; group: string; icon: any; go: () => void }[] = [];
    if (sid) {
      for (const n of SUBJECT_NAV) out.push({ label: n.label, group: "Ir a", icon: n.icon, go: () => nav(`/m/${sid}/${n.to}`) });
      for (const t of topics.data?.topics ?? []) out.push({ label: t.name, group: "Tema", icon: Network, go: () => nav(`/m/${sid}/tema/${t.id}`) });
      out.push({ label: "Nuevo ejercicio del tema más débil", group: "Acción", icon: Dumbbell, go: () => nav(`/m/${sid}/practicar?auto=1`) });
      out.push({ label: "Empezar sesión de 45 minutos", group: "Acción", icon: Timer, go: () => nav(`/m/${sid}/estudiar?min=45`) });
    }
    for (const s of subjects.data ?? []) out.push({ label: s.name, group: "Materia", icon: HomeIcon, go: () => nav(`/m/${s.id}`) });
    out.push({ label: "Ajustes", group: "Ir a", icon: Settings, go: () => nav("/ajustes") });
    const n = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const filtered = n ? out.filter((i) => i.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n)) : out;
    if (sid && q.trim().length > 2) filtered.push({ label: `Preguntar al tutor: «${q.trim()}»`, group: "Tutor", icon: MessageCircle, go: () => nav(`/m/${sid}/tutor?q=${encodeURIComponent(q.trim())}`) });
    for (const h of hits) filtered.push({ label: `${h.file} · ${h.location}`, group: "Material", icon: FolderOpen, go: () => nav(`/m/${sid}/material?chunk=${h.id}`) });
    return filtered.slice(0, 40);
  }, [q, sid, subjects.data, topics.data, hits, nav]);

  if (!open) return null;
  const run = (i: number) => {
    items[i]?.go();
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Paleta de comandos">
        <input
          autoFocus
          className="palette-input"
          placeholder={sid ? "Buscá una pantalla, un tema o algo del material…" : "Buscá una materia o pantalla…"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") run(sel);
            else if (e.key === "Escape") onClose();
          }}
        />
        <div className="palette-list">
          {items.map((it, i) => (
            <div key={i} className={`palette-item ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(i)}>
              <it.icon />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              <span className="group">{it.group}</span>
            </div>
          ))}
          {!items.length && <div className="empty small">Sin resultados</div>}
        </div>
      </div>
    </div>
  );
}

export function useSid() {
  return Number(useParams().sid);
}
