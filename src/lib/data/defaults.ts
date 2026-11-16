import type { Dashboard, DashboardWidget, LayoutItem } from "../types";

type W = [type: string, config: Record<string, any>, x: number, y: number, w: number, h: number];

function build(id: string, name: string, isDefault: boolean, items: W[]): Dashboard {
  const widgets: DashboardWidget[] = [];
  const lg: LayoutItem[] = [];
  items.forEach(([type, config, x, y, w, h], n) => {
    const i = `${type}-${n}`;
    widgets.push({ i, type, config });
    lg.push({ i, x, y, w, h });
  });
  return { id, name, isDefault, widgets, layouts: { lg } };
}

/** Três modelos de partida para não começar em branco. */
export function defaultDashboards(): Dashboard[] {
  return [
    build("tpl-diario", "Diário", true, [
      ["readiness", {}, 0, 0, 4, 6],
      ["recommendation", {}, 4, 0, 5, 6],
      ["nextRace", {}, 9, 0, 3, 3],
      ["kpi", { metric: "duration", sport: "all", period: "last28", compareOffset: 1 }, 9, 3, 3, 3],
      ["alerts", {}, 0, 6, 6, 6],
      ["healthTrend", { metric: "hrv", days: 60 }, 6, 6, 6, 6],
      ["loadChart", { days: 120 }, 0, 12, 8, 7],
      ["zones", { days: 28 }, 8, 12, 4, 7],
      ["healthTrend", { metric: "sleep", days: 30 }, 0, 19, 6, 6],
      ["recentActivities", { limit: 6 }, 6, 19, 6, 6],
    ]),
    build("tpl-epoca", "Época", false, [
      ["kpi", { metric: "distance", sport: "swim", period: "ytd", compareOffset: 1 }, 0, 0, 3, 3],
      ["kpi", { metric: "distance", sport: "bike", period: "ytd", compareOffset: 1 }, 3, 0, 3, 3],
      ["kpi", { metric: "distance", sport: "run", period: "ytd", compareOffset: 1 }, 6, 0, 3, 3],
      ["kpi", { metric: "duration", sport: "all", period: "ytd", compareOffset: 1 }, 9, 0, 3, 3],
      ["cumulative", { metric: "duration", sport: "all", compare: [1, 2, 3] }, 0, 3, 7, 8],
      ["compareTable", { metrics: ["distance", "duration"], groupBy: ["sport"], period: "ytd", compare: [1, 2, 3] }, 7, 3, 5, 8],
      ["periodBars", { metric: "duration", sport: "all", compare: [1, 2] }, 0, 11, 7, 7],
      ["weeklyLoad", { weeks: 16 }, 7, 11, 5, 7],
      ["heatmap", { weeks: 26 }, 0, 18, 12, 5],
    ]),
    build("tpl-preprova", "Pré-prova", false, [
      ["nextRace", {}, 0, 0, 3, 4],
      ["readiness", {}, 3, 0, 4, 6],
      ["note", { text: "Objetivo: sub-5h no Meio Ironman.\nTaper: 10 dias, manter abertura de pernas." }, 7, 0, 5, 4],
      ["loadChart", { days: 60 }, 0, 6, 12, 7],
      ["healthTrend", { metric: "rhr", days: 30 }, 0, 13, 6, 6],
      ["healthTrend", { metric: "bb", days: 30 }, 6, 13, 6, 6],
    ]),
  ];
}
