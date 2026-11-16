import { describe, it, expect } from "vitest";
import { EXERCISES } from "../engine/functional";
import { FIGURES } from "../../components/figures/poses";
import { computeJoints, FRAME_W, FRAME_H, HEAD_R } from "../../components/figures/skeleton";

describe("ilustrações dos exercícios", () => {
  it("todos os 50 exercícios têm ilustração e não há ilustrações órfãs", () => {
    expect(EXERCISES.length).toBe(50);
    expect(EXERCISES.filter((e) => !FIGURES[e.id]).map((e) => e.id)).toEqual([]);
    expect(Object.keys(FIGURES).filter((id) => !EXERCISES.some((e) => e.id === id))).toEqual([]);
  });
  it("cada figura tem 1–3 quadros e o corpo fica dentro do quadro", () => {
    for (const [id, f] of Object.entries(FIGURES)) {
      expect(f.frames.length, id).toBeGreaterThanOrEqual(1);
      expect(f.frames.length, id).toBeLessThanOrEqual(3);
      for (const fr of f.frames) {
        const j = computeJoints(fr.pose);
        for (const [name, [x, y]] of Object.entries(j)) {
          const pad = name === "head" ? HEAD_R : 0;
          expect(x - pad, `${id}.${name} x`).toBeGreaterThan(0);
          expect(x + pad, `${id}.${name} x`).toBeLessThan(FRAME_W);
          expect(y - pad, `${id}.${name} y`).toBeGreaterThan(0);
          expect(y + pad, `${id}.${name} y`).toBeLessThan(FRAME_H);
        }
      }
    }
  });
});
