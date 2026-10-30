import { useEffect, useRef, useState, type ComponentType, type InputHTMLAttributes, type ReactNode } from "react";
import { DEFAULT_DOCLING_SERVER, type ConversionJob, type ServerCheck } from "./server-types.ts";

async function request<T>(base: string, endpoint: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${base}api/docling-${endpoint}`, { method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}
type Text = (key: string) => string;
type Props = {
  base: string; text: Text;
  GuideLink: ComponentType<{ children?: ReactNode }>;
  Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
  Button: ComponentType<{ children?: ReactNode; onClick(): void; disabled?: boolean }>;
};

export function DoclingServerSettings({ base, text, Input, Button, GuideLink }: Props) {
  const [server, setServer] = useState(DEFAULT_DOCLING_SERVER);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [report, setReport] = useState<ServerCheck>();
  const saved = useRef("");
  const saving = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void request<{ server: string }>(base, "settings").then(value => {
      if (active) { setServer(value.server); saved.current = value.server; setLoaded(true); }
    }).catch(error => { if (active) { setProblem(String(error)); setLoaded(true); } });
    return () => { active = false; };
  }, [base]);
  const persist = () => {
    if (server === saved.current) return saving.current;
    const value = server;
    saving.current = saving.current.catch(() => {}).then(async () => {
      const settings = await request<{ server: string }>(base, "settings", "PUT", { server: value });
      saved.current = settings.server;
    });
    return saving.current;
  };
  const check = async () => {
    setBusy(true); setProblem(""); setReport(undefined);
    try { await persist(); setReport(await request<ServerCheck>(base, "check", "POST", {})); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section className="settings-section settings-section--stacked" aria-labelledby="docling-server-title" aria-busy={busy}>
    <div className="settings-label">
      <h3 className="settings-heading" id="docling-server-title">{text("Docling server")}</h3>
      <p>{text("Saved on the Host device. HTTP Host clients share this server setting.")}</p>
      <p>{text("Profile ieumdoc-pdf-en-v1 requires docling-serve 1.32.0.")}</p>
      <p>{text("Connection checks verify version and readiness, not conversion models. The server operator must prepare the profile models.")}</p>
    </div>
    <label htmlFor="docling-server">{text("Server address")}</label>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Input id="docling-server" className="min-w-0 flex-1" value={server} disabled={!loaded || busy}
        aria-invalid={!!problem} aria-describedby="docling-server-result"
        onChange={event => { setServer(event.target.value); setProblem(""); setReport(undefined); }}
        onBlur={() => { if (loaded && !busy) void persist().then(() => setProblem("")).catch(error => setProblem(error.message)); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void check(); } }} />
      <Button disabled={!loaded || busy} onClick={() => void check()}>{text(busy ? "Checking…" : "Check connection")}</Button>
    </div>
    <div id="docling-server-result" role="status" className="settings-label [overflow-wrap:anywhere]">
      {problem ? <p role="alert">{text("Could not save or check the server address.")} {problem}</p> : null}
      {report ? <>
        <p>{text(report.ok ? "Server is responding, ready and compatible." : report.code === "not-ready" ? "Server is responding but is not ready."
          : report.code === "version" ? "Server version is incompatible; docling-serve 1.32.0 is required."
          : report.code === "openapi" ? "The server OpenAPI specification is unavailable or incompatible." : "Could not connect to the Docling server.")}</p>
        {report.version ? <p>docling-serve {report.version}</p> : null}
        {report.openapiMatches !== undefined ? <p>{text(report.openapiMatches ? "OpenAPI matches the profile reference."
          : "OpenAPI differs from the profile reference. Matching version permits conversion; the difference is recorded.")}</p> : null}
        {!report.ok && report.message ? <p>{report.message}</p> : null}
      </> : null}
    </div>
    <GuideLink>{text("Server setup guide")}</GuideLink>
  </section>;
}

/** Polls only the Host, never the external Docling server. A failed read keeps the job cancellable. */
export function useDoclingConversion(base: string) {
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      let keepPolling = job?.state === "running";
      try {
        const value = await request<ConversionJob | null>(base, "conversion");
        if (active && version === generation.current) {
          // Only in-flight work is observed after a page reload. Completed tabs are not restored.
          if (job || value?.state === "running") setJob(value);
          keepPolling = value?.state === "running";
        }
      } catch (error) { if (active) setProblem(error instanceof Error ? error.message : String(error)); }
      finally { if (active && keepPolling) timer = setTimeout(() => void poll(), 1000); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [base, job?.id, job?.state]);
  const start = async (path: string) => {
    if (pendingRef.current) return;
    generation.current++; pendingRef.current = true; setPending(true); setProblem("");
    try { setJob(await request<ConversionJob>(base, "conversion", "POST", { path })); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); throw error; }
    finally { pendingRef.current = false; setPending(false); }
  };
  const cancel = async () => {
    if (!job || pendingRef.current) return;
    generation.current++; pendingRef.current = true; setPending(true);
    try { setJob(await request<ConversionJob>(base, "conversion", "DELETE", { id: job.id })); setProblem(""); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return { job, problem, pending, start, cancel };
}
