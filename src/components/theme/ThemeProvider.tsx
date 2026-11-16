import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "tricoach.theme";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } | null>(null);

function initial(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === "light" || t === "dark") return t; } catch { /* sem armazenamento */ }
  return "dark"; // tema escuro por defeito
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(KEY, theme); } catch { /* sem armazenamento */ }
  }, [theme]);
  return <Ctx.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme fora do ThemeProvider");
  return c;
}
