// TabPFN via the Prior Labs REST API: fit once on the labeled table, predict per professor.
import { createHash } from "node:crypto";
import { features, models } from "../db.ts";
import type { Features } from "./openalex.ts";

const API = "https://api.priorlabs.ai/tabpfn";
export const COLUMNS: (keyof Features)[] = ["new_first_authors_rate", "new_first_authors_trend", "junior_cohort", "outflow", "pub_rate", "pub_rate_trend", "career_years", "years_since_last", "active_grants", "months_since_grant"];

async function call<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.PRIORLABS_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  // 409 is "already uploaded", which is fine for a re-run
  if (!r.ok && r.status !== 409) throw new Error(`TabPFN ${path} ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text.trim()) as T;
}

type UploadInfo = { signed_urls: string[]; required_headers: Record<string, string> };
async function put(info: UploadInfo, csv: string) {
  const r = await fetch(info.signed_urls[0], { method: "PUT", headers: info.required_headers, body: csv });
  if (!r.ok) throw new Error(`TabPFN upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const csvOf = (rows: number[][], header: string[]) => [header.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";

/** The training table: every professor with a stated status, features, and non-alphabetical authorship. */
export async function trainingTable() {
  const docs = await features.find({ status: { $in: ["recruiting", "not_recruiting"] }, alphabetical: false }).toArray();
  return {
    x: docs.map((d) => COLUMNS.map((c) => d.features[c])),
    y: docs.map((d) => (d.status === "recruiting" ? 1 : 0)),
    names: docs.map((d) => d.name),
  };
}

/** Fit once per distinct training table; the fitted id is kept in Atlas. */
export async function fittedId(): Promise<string> {
  const { x, y } = await trainingTable();
  const xcsv = csvOf(x, COLUMNS), ycsv = csvOf(y.map((v) => [v]), ["recruiting"]);
  const hash = createHash("sha256").update(xcsv + ycsv).digest("hex");
  const cached = await models.findOne({ hash });
  if (cached) return cached.fittedTrainSetId;

  const prep = await call<{ train_set_upload_id: string; x_train_info: UploadInfo; y_train_info: UploadInfo }>("prepare_train_set_upload", {
    x_train_info: { format: "csv" }, y_train_info: { format: "csv" },
  });
  if (prep.x_train_info) { await put(prep.x_train_info, xcsv); await put(prep.y_train_info, ycsv); }
  const fit = await call<{ fitted_train_set_id: string; status: string }>("fit", {
    train_set_upload_id: prep.train_set_upload_id,
    task_config: { task: "classification", tabpfn_config: { model_path: "v3.5_default" } },
  });
  if (fit.status === "failed") throw new Error("TabPFN fit failed");
  await models.insertOne({ hash, fittedTrainSetId: fit.fitted_train_set_id, rows: y.length, fittedAt: new Date().toISOString() });
  return fit.fitted_train_set_id;
}

/** Probability that a professor with these features is recruiting. */
export async function predict(f: Features): Promise<number> {
  const fitted = await fittedId();
  const prep = await call<{ test_set_upload_id: string; x_test_info?: UploadInfo }>("prepare_test_set_upload", {
    fitted_train_set_id: fitted, x_test_info: { format: "csv" }, force_reupload: true,
  });
  if (prep.x_test_info) await put(prep.x_test_info, csvOf([COLUMNS.map((c) => f[c])], COLUMNS));
  const res = await call<{ prediction: number[][]; metadata: { classes?: (string | number)[] } }>("predict", {
    test_set_upload_id: prep.test_set_upload_id,
    fitted_train_set_id: fitted,
    task_config: { task: "classification", predict_params: { output_type: "probas" } },
  });
  const classes = (res.metadata.classes ?? [0, 1]).map(Number);
  return res.prediction[0][classes.indexOf(1)];
}
