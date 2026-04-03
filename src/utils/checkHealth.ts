/**
 * checkHealth.ts — Connectivity probe for SuperBrain infrastructure
 *
 * Pings Frankfurt seed node + local Ollama with strict 10s timeout.
 * Returns structured results, never throws, never hangs.
 */

import axios from "axios";

const TIMEOUT = 10_000; // 10s hard cap on all probes

export interface HealthResult {
  frankfurtOnline: boolean;
  frankfurtLatencyMs: number;
  chunkCount: number | null;
  peerCount: number | null;
  ollamaOnline: boolean;
  ollamaModels: string[];
  errors: string[];
}

export async function checkHealth(
  sn442Node: string,
  ollamaUrl: string
): Promise<HealthResult> {
  const result: HealthResult = {
    frankfurtOnline: false,
    frankfurtLatencyMs: -1,
    chunkCount: null,
    peerCount: null,
    ollamaOnline: false,
    ollamaModels: [],
    errors: [],
  };

  // ── Frankfurt probes (parallel, 10s timeout each) ──
  const t0 = Date.now();
  const [health, knowledge, peers] = await Promise.allSettled([
    axios.get(`${sn442Node}/health`, { timeout: TIMEOUT }),
    axios.get(`${sn442Node}/knowledge`, { timeout: TIMEOUT }),
    axios.get(`${sn442Node}/peers`, { timeout: TIMEOUT }),
  ]);
  const latency = Date.now() - t0;

  if (health.status === "fulfilled") {
    result.frankfurtOnline = true;
    result.frankfurtLatencyMs = latency;
  } else {
    result.errors.push(`Frankfurt /health: ${extractError(health.reason)}`);
  }

  if (knowledge.status === "fulfilled") {
    const data = knowledge.value.data;
    result.chunkCount = Array.isArray(data)
      ? data.length
      : data?.chunks?.length ?? null;
  }

  if (peers.status === "fulfilled") {
    const data = peers.value.data;
    result.peerCount = Array.isArray(data)
      ? data.length
      : data?.peers?.length ?? null;
  }

  // ── Ollama probe (10s timeout) ──
  try {
    const ollamaRes = await axios.get(`${ollamaUrl}/api/tags`, {
      timeout: TIMEOUT,
    });
    result.ollamaOnline = true;
    result.ollamaModels =
      ollamaRes.data?.models?.map((m: any) => m.name) || [];
  } catch (e: any) {
    result.errors.push(`Ollama: ${extractError(e)}`);
  }

  return result;
}

function extractError(e: any): string {
  if (e?.code === "ECONNREFUSED") return "connection refused";
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") return "timeout (10s)";
  if (e?.response?.status) return `HTTP ${e.response.status}`;
  return e?.message || "unknown error";
}
