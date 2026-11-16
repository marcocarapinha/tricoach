import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/ThemeProvider";

/**
 * Fundo "aurora" animado, ao estilo Aceternity UI.
 * As faixas usam os tokens do tema (--primary, --secondary, --accent, --background),
 * por isso acompanham o tema claro/escuro. A animação pára com prefers-reduced-motion
 * (regra em index.css) e a entrada usa Framer Motion, que respeita o MotionConfig da app.
 */
export interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** máscara radial a partir do canto superior direito (padrão Aceternity) */
  showRadialGradient?: boolean;
  /** opacidade da aurora (0–1) */
  intensity?: number;
}

export function AuroraBackground({ className, children, showRadialGradient = true, intensity, ...props }: AuroraBackgroundProps) {
  const { theme } = useTheme();
  const opacity = intensity ?? (theme === "dark" ? 0.75 : 0.6);
  return (
    <div className={cn("relative isolate overflow-hidden bg-card", className)} {...props}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="aurora-layer absolute -inset-[10px]"
          style={showRadialGradient ? { maskImage: "radial-gradient(ellipse at 100% 0%, black 20%, transparent 78%)", WebkitMaskImage: "radial-gradient(ellipse at 100% 0%, black 20%, transparent 78%)" } : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        {/* véu para garantir contraste do texto sobre a aurora */}
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/50 to-transparent" />
      </div>
      {children}
    </div>
  );
}
