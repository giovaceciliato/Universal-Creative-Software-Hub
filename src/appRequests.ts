import type { CatalogApp, Platform, PricingModel } from "./types";

export interface AppRequestDraft {
  name: string;
  publisher: string;
  website: string;
  repository: string;
  description: string;
  platforms: Platform[];
  pricingModel: PricingModel;
}
export interface AppRequestMatch {
  name: string;
  url: string;
  state: "approved" | "open" | "closed";
  reason: string;
}
export interface RequestCheckResult {
  matches: AppRequestMatch[];
  checkedIssues: number;
  truncated: boolean;
}

export const emptyAppRequest: AppRequestDraft = {
  name: "", publisher: "", website: "", repository: "",
  description: "", platforms: ["linux", "windows"],
  pricingModel: "free-open-source",
};

export function validateAppRequest(draft: AppRequestDraft): string | null {
  if (!draft.name.trim() || draft.name.length > 80 || /[<>\n\r]/.test(draft.name))
    return "Inserisci un nome valido (massimo 80 caratteri).";
  if (!draft.publisher.trim() || draft.publisher.length > 100 || /[<>\n\r]/.test(draft.publisher))
    return "Indica il produttore o il progetto responsabile.";
  if (!isHttps(draft.website)) return "Inserisci un sito ufficiale HTTPS valido.";
  if (draft.repository && (!isHttps(draft.repository) ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i.test(draft.repository)))
    return "Il repository deve essere un link GitHub nella forma https://github.com/owner/repo.";
  if (draft.description.trim().length < 10 || draft.description.length > 240 || /[<>]/.test(draft.description))
    return "La descrizione deve avere da 10 a 240 caratteri.";
  if (!draft.platforms.length) return "Seleziona almeno una piattaforma.";
  return null;
}

function isHttps(raw: string): boolean {
  if (!raw || raw.length > 350) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && Boolean(url.hostname.includes(".")) &&
      !url.username && !url.password && !url.port &&
      !/\.(local|localhost|internal)$/i.test(url.hostname) &&
      !["localhost", "127.0.0.1"].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

function urlIdentity(raw: string): string {
  try {
    const url = new URL(raw);
    return url.hostname.toLowerCase() + url.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return raw.trim().toLowerCase(); }
}

export function localRequestMatches(
  draft: AppRequestDraft, apps: CatalogApp[],
): AppRequestMatch[] {
  return apps.flatMap(app => {
    let reason = "";
    if (draft.repository && app.links.sourceCode &&
      urlIdentity(draft.repository) === urlIdentity(app.links.sourceCode))
      reason = "Repository GitHub già presente";
    else if (urlIdentity(draft.website) === urlIdentity(app.links.website))
      reason = "Sito ufficiale già presente";
    else if (draft.name.trim().toLowerCase() === app.name.trim().toLowerCase())
      reason = "Nome già presente (verifica eventuali omonimie)";
    return reason ? [{
      name: app.name,
      state: "approved" as const,
      reason,
      url: app.links.website,
    }] : [];
  });
}

export function issueCreationUrl(draft: AppRequestDraft): string {
  const req = {
    ...draft,
    name: draft.name.trim(),
    publisher: draft.publisher.trim(),
    website: draft.website.trim(),
    repository: draft.repository.trim(),
    description: draft.description.trim(),
  };
  const structured = "<!-- ucsh-app-request:v1\n" + JSON.stringify(req) + "\n-->";
  const body = [
    structured, "",
    "## Software richiesto", req.name,
    "## Produttore", req.publisher,
    "## Sito ufficiale", req.website,
    "## Repository", req.repository || "Non disponibile",
    "## Piattaforme", req.platforms.join(", "),
    "## Licenza", req.pricingModel,
    "## Descrizione", req.description, "",
    "Questa richiesta deve essere verificata e approvata dai manutentori.",
    "Non aggiunge automaticamente permessi di installazione al launcher.",
  ].join("\n");
  const params = new URLSearchParams({
    title: "[App Request] " + req.name,
    body,
  });
  return "https://github.com/giovaceciliato/Universal-Creative-Software-Hub/issues/new?" +
    params.toString();
}
