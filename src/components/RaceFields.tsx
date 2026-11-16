import { RACE_DISTANCES, RACE_SPORT_LABEL, type RaceSport } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Primeira distância "típica" de cada desporto, usada quando se muda de desporto. */
const DEFAULT_DISTANCE: Record<RaceSport, string> = { triathlon: "olympic", run: "run_10k", bike: "bike_road", swim: "swim_400", open_water: "ow_3k" };

/** Desporto e distância da prova: a lista de distâncias muda com o desporto. */
export function RaceSportDistance({ sport, distance, onChange }: { sport: RaceSport; distance: string; onChange: (v: { sport: RaceSport; distance: string }) => void }) {
  const options = RACE_DISTANCES[sport];
  return (
    <>
      <div className="space-y-1">
        <Label>Desporto</Label>
        <Select value={sport} onValueChange={(v) => {
          const s = v as RaceSport;
          onChange({ sport: s, distance: RACE_DISTANCES[s].some((d) => d.key === distance) ? distance : DEFAULT_DISTANCE[s] });
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(RACE_SPORT_LABEL) as RaceSport[]).map((s) => <SelectItem key={s} value={s}>{RACE_SPORT_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Distância</Label>
        <Select value={options.some((d) => d.key === distance) ? distance : "other"} onValueChange={(v) => onChange({ sport, distance: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </>
  );
}
