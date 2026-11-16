import { useId } from "react";
import { FIGURES } from "./poses";
import { FLOOR, FRAME_H, FRAME_W, HEAD_R, computeJoints, resolve, type Frame, type Joints, type Pt } from "./skeleton";
import { cn } from "@/lib/utils";

const line = (a: Pt, b: Pt) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;

function Body({ j, front, bend }: { j: Joints; front: boolean; bend?: number }) {
  // coluna: curva quadrática entre anca e ombro
  const mx = (j.hip[0] + j.shoulder[0]) / 2, my = (j.hip[1] + j.shoulder[1]) / 2;
  const dx = j.shoulder[0] - j.hip[0], dy = j.shoulder[1] - j.hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (dy / len) * (bend ?? 0), cy = my - (dx / len) * (bend ?? 0);
  const spine = `M${j.hip[0].toFixed(1)} ${j.hip[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${j.shoulder[0].toFixed(1)} ${j.shoulder[1].toFixed(1)}`;
  const limb = (pts: Pt[]) => pts.slice(1).map((p, i) => line(pts[i], p)).join("");
  const far = front ? 1 : 0.5;
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* lado afastado (mais claro em vista lateral) */}
      <g opacity={far} strokeWidth={4.2}>
        <path d={limb([j.hipF, j.kneeF, j.ankleF, j.toeF])} />
        <path d={limb([j.shoulderF, j.elbowF, j.handF])} />
      </g>
      <g strokeWidth={4.6}>
        {front && <path d={line(j.hipN, j.hipF) + line(j.shoulderN, j.shoulderF)} strokeWidth={3.6} />}
        <path d={spine} strokeWidth={5.4} />
        <path d={line(j.shoulder, j.neck)} strokeWidth={4} />
        <path d={limb([j.hipN, j.kneeN, j.ankleN, j.toeN])} />
        <path d={limb([j.shoulderN, j.elbowN, j.handN])} />
      </g>
      <circle cx={j.head[0]} cy={j.head[1]} r={HEAD_R} fill="currentColor" stroke="none" />
    </g>
  );
}

function Props({ frame, j, uid }: { frame: Frame; j: Joints; uid: string }) {
  return (
    <>
      {(frame.props ?? []).map((p, i) => {
        switch (p.kind) {
          case "step":
            return <rect key={i} x={p.x} y={FLOOR - p.h} width={p.w} height={p.h} rx={2} className="fill-muted stroke-muted-foreground/60" strokeWidth={1.2} />;
          case "bench":
            return (
              <g key={i} className="stroke-muted-foreground/70" strokeWidth={1.4}>
                <rect x={p.x} y={FLOOR - p.h} width={p.w} height={4} rx={1.5} className="fill-muted-foreground/40" />
                <line x1={p.x + 3} y1={FLOOR - p.h + 4} x2={p.x + 3} y2={FLOOR} /><line x1={p.x + p.w - 3} y1={FLOOR - p.h + 4} x2={p.x + p.w - 3} y2={FLOOR} />
              </g>
            );
          case "wall":
            return <g key={i}><rect x={p.x - (p.x < FRAME_W / 2 ? 6 : 0)} y={6} width={6} height={FLOOR - 6} className="fill-muted" /><line x1={p.x} y1={6} x2={p.x} y2={FLOOR} className="stroke-muted-foreground/60" strokeWidth={1.2} /></g>;
          case "post":
            return <rect key={i} x={p.x - 2.5} y={FLOOR - (p.h ?? 70)} width={5} height={p.h ?? 70} rx={1.5} className="fill-muted-foreground/50" />;
          case "band": {
            const a = resolve(p.from, j), b = resolve(p.to, j);
            return <path key={i} d={line(a, b)} className="stroke-accent" strokeWidth={2.4} strokeDasharray="4 2.5" strokeLinecap="round" />;
          }
          case "weight": {
            const [x, y] = resolve(p.at, j);
            return <g key={i} className="fill-secondary"><rect x={x - 6} y={y - 2.5} width={12} height={5} rx={1.5} /><rect x={x - 7.5} y={y - 5} width={3.5} height={10} rx={1} /><rect x={x + 4} y={y - 5} width={3.5} height={10} rx={1} /></g>;
          }
          case "ball": {
            const [x, y] = resolve(p.at, j);
            return <circle key={i} cx={x} cy={y} r={p.r ?? 5} className="fill-accent/70" />;
          }
          case "slider": {
            const [x, y] = resolve(p.at, j);
            return <rect key={i} x={x - 6} y={y + 1} width={12} height={3} rx={1.5} className="fill-accent" />;
          }
          case "towel": {
            const [x, y] = resolve(p.at, j);
            return <ellipse key={i} cx={x} cy={y + 1} rx={4} ry={3} className="fill-accent/70" />;
          }
          case "bar": {
            const [x, y] = resolve(p.at, j);
            return <g key={i}><rect x={x - 5} y={y - 9} width={10} height={6} rx={2} className="fill-secondary" /></g>;
          }
          case "arrow": {
            const a = resolve(p.from, j), b = resolve(p.to, j);
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
            const c = p.curve ?? 0;
            const cx = mx + (dy / len) * c, cy = my - (dx / len) * c;
            return <path key={i} d={`M${a[0]} ${a[1]}Q${cx} ${cy} ${b[0]} ${b[1]}`} fill="none" className="stroke-primary" strokeWidth={2} markerEnd={`url(#${uid}-arrow)`} strokeLinecap="round" />;
          }
          case "label":
            return <text key={i} x={p.at[0]} y={p.at[1]} className="fill-muted-foreground" fontSize={9} textAnchor="middle">{p.text}</text>;
        }
      })}
    </>
  );
}

/** Ilustração do exercício: posição inicial → final (até 3 quadros). */
export function ExerciseFigure({ id, className, compact }: { id: string; className?: string; compact?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const fig = FIGURES[id];
  if (!fig) return null;
  const n = fig.frames.length;
  const gap = 18;
  const W = n * FRAME_W + (n - 1) * gap;
  return (
    <svg viewBox={`0 0 ${W} ${FRAME_H}`} className={cn("w-full text-foreground", className)} role="img" aria-label={`Ilustração: ${fig.frames.map((f) => f.caption).filter(Boolean).join(" → ")}`}>
      <defs>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="fill-primary" />
        </marker>
      </defs>
      {fig.frames.map((f, i) => {
        const j = computeJoints(f.pose);
        const ox = i * (FRAME_W + gap);
        return (
          <g key={i} transform={`translate(${ox} 0)`}>
            <rect x={0.5} y={0.5} width={FRAME_W - 1} height={FRAME_H - 1} rx={10} className="fill-muted/40 stroke-border" />
            {fig.view !== "top" && <line x1={8} y1={FLOOR} x2={FRAME_W - 8} y2={FLOOR} className="stroke-muted-foreground/50" strokeWidth={1.4} />}
            <Props frame={{ ...f, props: (f.props ?? []).filter((p) => p.kind !== "arrow" && p.kind !== "band") }} j={j} uid={uid} />
            <Body j={j} front={!!f.pose.front} bend={f.pose.bend} />
            <Props frame={{ ...f, props: (f.props ?? []).filter((p) => p.kind === "arrow" || p.kind === "band") }} j={j} uid={uid} />
            {!compact && n > 1 && <text x={10} y={16} fontSize={10} fontWeight={600} className="fill-muted-foreground">{i + 1}</text>}
            {!compact && f.caption && <text x={FRAME_W / 2} y={FRAME_H - 3} fontSize={8.5} textAnchor="middle" className="fill-muted-foreground">{f.caption}</text>}
          </g>
        );
      })}
      {n > 1 && Array.from({ length: n - 1 }, (_, i) => {
        const x = (i + 1) * FRAME_W + i * gap + gap / 2;
        return <path key={i} d={`M${x - 5} ${FRAME_H / 2 - 5}L${x + 1} ${FRAME_H / 2}L${x - 5} ${FRAME_H / 2 + 5}`} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function hasFigure(id: string) { return !!FIGURES[id]; }
