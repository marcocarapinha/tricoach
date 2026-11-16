// Edge Function: garmin-activity
// POST { activityId }  (id interno da tabela activities)
// Devolve as séries temporais e voltas da atividade. Na primeira vez descarrega o ficheiro FIT
// (GET /download-service/files/activity/{garminId}, ZIP), converte-o e guarda em activity_streams.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { unzipSync } from "npm:fflate@0.8.2";
import FitParser from "npm:fit-file-parser@6.2.9";
import { authenticate } from "../_shared/auth.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/env.ts";
import { GARMIN_BASE, fitToStreams, getAccessToken } from "../_shared/garmin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });


function parseFit(buf: ArrayBuffer): Promise<any> {
  const parser = new FitParser({ force: true, mode: "list", speedUnit: "m/s", lengthUnit: "m", temperatureUnit: "celsius" });
  return new Promise((res, rej) => parser.parse(buf, (err: unknown, data: unknown) => (err ? rej(err) : res(data))));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  try {
    const a = await authenticate(req);
    if (!a.user) return json({ error: a.error }, a.status);
    const user = a.user;
    const { activityId, refresh } = await req.json();

    const { data: act } = await db.from("activities").select("id, user_id, garmin_id").eq("id", activityId).single();
    if (!act || act.user_id !== user.id) return json({ error: "Atividade não encontrada" }, 404);

    if (!refresh) {
      const { data: cached } = await db.from("activity_streams").select("sample_s, streams, laps").eq("activity_id", act.id).maybeSingle();
      if (cached) return json({ ok: true, cached: true, ...cached });
    }

    const { data: key } = await db.rpc("garmin_get_key", { p_user: user.id });
    if (!key) return json({ error: "Chave Garmin não configurada" }, 400);
    const { token } = await getAccessToken(key as string);

    const r = await fetch(`${GARMIN_BASE}/download-service/files/activity/${act.garmin_id}`, { headers: { Authorization: `Bearer ${token}`, Accept: "*/*" } });
    if (r.status === 404 || r.status === 204) return json({ error: "A Garmin não tem ficheiro para esta atividade (ex.: atividade manual)" }, 404);
    if (!r.ok) return json({ error: `Download FIT: HTTP ${r.status} ${(await r.text()).slice(0, 200)}` }, 502);

    const bytes = new Uint8Array(await r.arrayBuffer());
    // ZIP (application/x-zip-compressed) com um .fit; aceita também .fit direto
    let fit: Uint8Array = bytes;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const files = unzipSync(bytes);
      const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".fit"));
      if (!name) return json({ error: "ZIP sem ficheiro .fit" }, 502);
      fit = files[name];
    }
    const parsed = await parseFit(fit.buffer.slice(fit.byteOffset, fit.byteOffset + fit.byteLength) as ArrayBuffer);
    const row = fitToStreams(parsed, 5);
    const { error } = await db.from("activity_streams").upsert({ activity_id: act.id, user_id: user.id, ...row, fetched_at: new Date().toISOString() });
    if (error) throw error;
    return json({ ok: true, cached: false, ...row });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
