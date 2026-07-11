import { supabase, authEnabled } from "./supabase"

// Base URL for the API. In dev, Vite proxies /api → localhost:8000 (see
// vite.config.js). In prod, set VITE_API_URL to the deployed backend origin.
const API_BASE = import.meta.env.VITE_API_URL || ""

async function authHeader() {
  if (!authEnabled || !supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * fetch() wrapper that attaches the Supabase bearer token and resolves the
 * API base URL. Use for every backend call.
 */
export async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(options.headers || {}),
  }
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    // Network/CORS/backend-down — give a human message, not "Failed to fetch".
    throw new Error("Can't reach FinesseWins right now. Check your connection and try again.")
  }
  if (res.status === 401) {
    // Session expired or missing — bounce to sign-in.
    if (authEnabled && supabase) await supabase.auth.signOut()
    throw new Error("Your session expired. Please sign in again.")
  }
  return res
}

/** Convenience: apiFetch + JSON parse. */
export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json()
}

/** Trigger a browser download of an authenticated binary endpoint (DOCX export). */
export async function apiDownload(path, filename) {
  const res = await apiFetch(path)
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail || detail
    } catch {}
    throw new Error(detail)
  }
  await _saveBlob(await res.blob(), filename || "download.docx")
}

/** POST a JSON body and download the binary response (e.g. capability statement DOCX). */
export async function apiDownloadPost(path, body, filename) {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch {}
    throw new Error(detail)
  }
  await _saveBlob(await res.blob(), filename || "download.docx")
}

async function _saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
