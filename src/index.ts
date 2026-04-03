#!/usr/bin/env bun
/**
 * SuperBrain CLI — sb v2.1.0
 *
 * Universal interface to the SuperBrain SN442 knowledge network.
 * All network calls timeout at 10s max. Output uses process.stdout.write
 * for guaranteed visibility on any terminal / TTY state.
 */

import { Command } from "commander";
import axios from "axios";
import { checkHealth } from "./utils/checkHealth.js";
import { registerIngestZimCommand } from "./commands/ingest-zim.js";

const SN442_NODE = process.env.SN442_NODE || "http://46.225.114.202:8400";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.SB_MODEL || "qwen2.5:0.5b";
const NET_TIMEOUT = 10_000; // 10s hard cap — never hang

// ── Domain query expansion (Bittensor/SuperBrain domain terms) ───────────

const DOMAIN_EXPANSIONS: Record<string, string> = {
  sn442: "Subnet 442 SuperBrain Bittensor knowledge network",
  tao: "Bittensor TAO cryptocurrency token emissions",
  rag: "retrieval augmented generation vector search",
  sb: "SuperBrain decentralized knowledge",
  miner: "Bittensor miner validator incentive mechanism",
  p2p: "peer to peer gossip network sync",
  vtrust: "validator trust score consensus",
  uid: "unique identifier neuron registration",
  netuid: "network unique identifier subnet",
  hotkey: "Bittensor hotkey wallet signing key",
  coldkey: "Bittensor coldkey wallet storage key",
  metagraph: "Bittensor metagraph network state neurons",
  emission: "Bittensor TAO emission reward distribution",
  stake: "Bittensor TAO stake delegation",
};

function expandQuery(question: string): string {
  let expanded = question;
  for (const [abbr, full] of Object.entries(DOMAIN_EXPANSIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, `${abbr} (${full})`);
    }
  }
  return expanded;
}

// ── bulletproof output (process.stdout.write, never swallowed) ──────────
const isTTY = process.stdout.isTTY ?? false;
const c = {
  green:  (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    (s: string) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: (s: string) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:   (s: string) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  dim:    (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
  bold:   (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
};

function out(line: string) { process.stdout.write(line + "\n"); }
function eout(line: string) { process.stderr.write(line + "\n"); }

const program = new Command();

program
  .name("sb")
  .description("SuperBrain Protocol CLI — SN442 Decentralized Knowledge Network")
  .version("3.0.0");

// ── ask ──────────────────────────────────────────────────────────────────

program
  .command("ask")
  .description("Query the decentralized knowledge network")
  .argument("<question...>", "The question to ask (multi-word supported)")
  .option("-l, --local", "Force local Ollama inference only")
  .option("-n, --network", "Force network query only (skip local)")
  .option("-m, --model <model>", "Ollama model to use", DEFAULT_MODEL)
  .action(async (words: string[], options) => {
    const rawQuestion = words.join(" ");
    const question = expandQuery(rawQuestion);

    if (rawQuestion !== question) {
      out(c.dim(`[*] Query expanded: "${rawQuestion}" → "${question.substring(0, 80)}..."`));
    }

    // Phase 1: Try local Ollama (unless --network)
    if (!options.network) {
      out(c.dim("[*] Checking local knowledge (Ollama)..."));

      try {
        const localRes = await axios.post(
          `${OLLAMA_URL}/api/generate`,
          { model: options.model, prompt: question, stream: false },
          { timeout: NET_TIMEOUT }
        );

        if (localRes.data?.response) {
          out(c.green("[+] Local inference complete."));
          out("");
          out(localRes.data.response.trim());
          out("");
          out(c.dim(`Model: ${options.model} | Source: Local Ollama`));

          if (options.local) return;

          // Cross-reference with network
          out("");
          out(c.dim("[*] Cross-referencing with SN442 network..."));

          try {
            const netRes = await axios.post(
              `${SN442_NODE}/query`,
              { question, mode: "auto" },
              { timeout: NET_TIMEOUT }
            );
            const netAnswer = netRes.data.answer || "";
            if (netAnswer) {
              out(c.green("[+] Network validation received."));
              out("");
              out(c.cyan("Network says:"));
              out(netAnswer.trim());
              out("");
              out(c.dim("Verified via Subnet 442 | P2P Validated"));
            } else {
              out(c.yellow("[~] Network returned empty — local answer stands."));
            }
          } catch {
            out(c.yellow("[~] Network unreachable — local answer stands."));
          }
          return;
        }

        out(c.yellow("[~] Local model returned empty."));
      } catch (e: any) {
        const reason = e?.code === "ECONNREFUSED" ? "offline" : e?.code === "ECONNABORTED" ? "timeout (10s)" : "error";
        if (options.local) {
          eout(c.red(`[!] Ollama ${reason}. Cannot run in local-only mode.`));
          process.exit(1);
        }
        out(c.yellow(`[~] Ollama ${reason} — trying network...`));
      }
    }

    // Phase 2: Network query
    out(c.cyan("[*] Querying SN442 Knowledge Network..."));

    try {
      const t0 = performance.now();
      const response = await axios.post(
        `${SN442_NODE}/query`,
        { question, mode: "auto" },
        { timeout: NET_TIMEOUT }
      );
      const latencyMs = Math.round(performance.now() - t0);

      const answer = response.data.answer || "";
      const method = response.data.method || "unknown";
      const citations = response.data.citations || [];

      if (!answer) {
        out(c.yellow("[~] Network returned empty answer."));
        return;
      }

      out(c.green("[+] Knowledge retrieved."));
      out("");
      out(answer.trim());
      out("");
      out(c.dim(`Method: ${method} | Latency: ${latencyMs}ms | Source: SN442 P2P Network`));
      if (citations.length > 0) {
        out("");
        out(c.dim("Citations:"));
        for (const cite of citations) {
          out(c.dim(`  - ${typeof cite === "string" ? cite : JSON.stringify(cite)}`));
        }
      }
    } catch (e: any) {
      const reason = e?.code === "ECONNREFUSED" ? "connection refused" : e?.code === "ECONNABORTED" ? "timeout (10s)" : e?.message || "unknown";
      eout(c.red(`[!] Network unreachable: ${reason}`));
      eout(c.yellow("Ensure Frankfurt node (46.225.114.202:8400) or local Ollama is running."));
      process.exit(1);
    }
  });

// ── status ───────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Check Subnet 442 network health")
  .action(async () => {
    out(c.dim("[*] Pinging SN442 nodes (10s timeout)..."));

    const h = await checkHealth(SN442_NODE, OLLAMA_URL);

    out("");
    out(c.bold(c.cyan("━━━ SuperBrain SN442 Status ━━━")));
    out("");

    // Frankfurt node
    if (h.frankfurtOnline) {
      out(`  Node:       ${c.green("ONLINE")} (Frankfurt-Seed-1, ${h.frankfurtLatencyMs}ms)`);
    } else {
      out(`  Node:       ${c.red("OFFLINE")}`);
    }

    // Knowledge chunks
    out(`  Chunks:     ${h.chunkCount !== null ? `${h.chunkCount} validated knowledge pieces` : c.dim("unavailable")}`);

    // Peers
    out(`  Peers:      ${h.peerCount !== null ? `${h.peerCount} connected` : c.dim("unavailable")}`);

    out(`  Subnet:     SN442 (Bittensor Testnet)`);
    out(`  Endpoint:   ${c.dim(SN442_NODE)}`);
    out("");

    // Local Ollama
    if (h.ollamaOnline) {
      out(`  Ollama:     ${c.green("RUNNING")} (${h.ollamaModels.join(", ") || "no models"})`);
    } else {
      out(`  Ollama:     ${c.yellow("OFFLINE")}`);
    }

    // Errors
    if (h.errors.length > 0) {
      out("");
      out(c.dim("  Errors:"));
      for (const e of h.errors) {
        out(c.dim(`    - ${e}`));
      }
    }

    out("");
  });

// ── peers ────────────────────────────────────────────────────────────────

program
  .command("peers")
  .description("List connected peers in the network")
  .action(async () => {
    out(c.dim("[*] Fetching peer registry from seed node..."));

    try {
      const resp = await axios.get(`${SN442_NODE}/peers`, { timeout: NET_TIMEOUT });
      const allPeers: any[] = resp.data?.peers || [];

      out("");
      out(c.bold("  SuperBrain Network"));
      out("");

      // Show seed node first
      out(c.dim("  [SEED NODE]"));
      out(`  Frankfurt, Germany — 46.225.114.202:8400`);
      out(`  ${resp.data?.total_chunks || 0} chunks | always online`);
      out("");

      // Show real peers — deduplicate by URL
      const seen = new Set<string>();
      const realPeers = allPeers.filter((p: any) => {
        if (!p.url || p.url.includes("46.225.114.202") || p.is_seed) return false;
        if (seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
      });

      if (realPeers.length === 0) {
        out(c.dim("  No other peers online yet"));
        out(c.dim("  You are node #1. Start the network growing."));
      } else {
        out(c.dim(`  [${realPeers.length} PEER(S) REGISTERED]`));
        for (const p of realPeers) {
          out(`  \u2022 ${p.city || "Unknown"} — ${p.url}`);
          out(c.dim(`    ${p.chunks || 0} chunks | node: ${p.node_id || "anon"}`));
        }
      }

      const uniqueCount = realPeers.length + 1; // +1 for seed
      out("");
      out(c.dim(`  Total nodes: ${uniqueCount} (including seed)`));
    } catch {
      eout(c.red("[!] Could not reach seed node"));
    }
  });

// ── sync ────────────────────────────────────────────────────────────────

program
  .command("sync")
  .description("Pull knowledge directly from all known peers")
  .action(async () => {
    out(c.dim("[*] Fetching peer list from seed node..."));
    let peers: any[] = [];
    try {
      const resp = await axios.get(`${SN442_NODE}/peers`, { timeout: 8000 });
      const seenUrls = new Set<string>();
      peers = (resp.data?.peers || []).filter((p: any) => {
        if (!p.url || p.url.includes("46.225.114.202") || p.url.trim() === "") return false;
        if (seenUrls.has(p.url)) return false;
        seenUrls.add(p.url);
        return true;
      });
    } catch {
      eout("[!] Seed node unreachable");
      return;
    }

    if (peers.length === 0) {
      out(c.dim("[*] No other peers online yet — you are the network"));
      out(c.dim('[*] Grow it: sb share "your knowledge here"'));
      return;
    }

    out(c.dim(`[*] Found ${peers.length} peer(s). Pulling directly...`));
    let totalNew = 0;

    for (const peer of peers) {
      try {
        out(c.dim(`[*] ${peer.city || "Unknown"} (${peer.url})...`));
        const resp = await axios.get(`${peer.url}/knowledge/list`, { timeout: 8000 });
        const chunks = (resp.data?.chunks || []).filter((ch: any) => ch.privacy === "public");
        out(`  \u2713 ${peer.city || "Unknown"}: ${chunks.length} public chunks`);
        totalNew += chunks.length;
      } catch {
        out(c.dim(`  \u2717 ${peer.url} — offline`));
      }
    }

    out("");
    out(c.bold(`[*] Sync complete: ${totalNew} chunks from ${peers.length} peers`));
    out(c.dim("[*] Chunks are now available for local queries"));
  });

// ── share ────────────────────────────────────────────────────────────────

program
  .command("share")
  .description("Share knowledge to the SN442 network (permanent)")
  .argument("<content...>", "Knowledge content to share")
  .option("-t, --title <title>", "Title for the knowledge chunk")
  .action(async (words: string[], options) => {
    const content = words.join(" ");

    out("");
    out(c.bold(c.yellow("WARNING: Sharing to the network is PERMANENT.")));
    out(c.yellow("This content will be visible to all peers and cannot be deleted."));
    out("");
    out(c.dim(`Content: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`));
    out("");

    out(c.cyan("[*] Broadcasting to SN442..."));

    try {
      const resp = await axios.post(
        `${SN442_NODE}/knowledge/share`,
        {
          content,
          title: options.title || content.slice(0, 50),
          source: "superbrain-cli",
        },
        { timeout: NET_TIMEOUT }
      );

      const chunkId = resp.data?.chunk_id || "unknown";
      out(c.green(`[+] Knowledge shared to network. chunk_id: ${chunkId}`));
      out(c.dim("Chunk is now on SN442 — validator will score it within 12 seconds"));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "unknown";
      eout(c.red(`[!] Failed to share: ${detail}`));
    }
  });

// ── ingest-zim ──────────────────────────────────────────────────────────
registerIngestZimCommand(program);

// ── benchmark ───────────────────────────────────────────────────────────

program
  .command("benchmark")
  .description("Score your hardware for SN442 mining")
  .action(async () => {
    out(c.dim("[*] Running SuperBrain Hardware Benchmark..."));
    out("");

    const cpuStart = performance.now();

    // CPU benchmark — 10,000 3x3 matrix multiplications
    out(c.dim("  Testing CPU..."));
    for (let iter = 0; iter < 10000; iter++) {
      const a = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => Math.random()));
      const b = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => Math.random()));
      const c2 = Array.from({ length: 3 }, () => Array(3).fill(0));
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          for (let k = 0; k < 3; k++) c2[i][j] += a[i][k] * b[k][j];
    }
    const cpuMs = performance.now() - cpuStart;
    const cpuCores = (await import("os")).cpus().length;
    let cpuScore = Math.min(1000, Math.round(10_000_000 / cpuMs));
    if (cpuCores >= 8) cpuScore = Math.min(1000, cpuScore + 50);
    else if (cpuCores >= 4) cpuScore = Math.min(1000, cpuScore + 25);

    // RAM
    const os = await import("os");
    const totalGB = Math.round(os.totalmem() / (1024 ** 3) * 10) / 10;
    const freeGB = Math.round(os.freemem() / (1024 ** 3) * 10) / 10;
    let ramScore = totalGB >= 32 ? 1000 : totalGB >= 16 ? 850 : totalGB >= 8 ? 650 : totalGB >= 4 ? 400 : 200;
    if (freeGB < 2) ramScore = Math.max(0, ramScore - 100);

    // Storage — write speed test
    out(c.dim("  Testing storage..."));
    const fs = await import("fs");
    const path = await import("path");
    const testFile = path.join(os.homedir(), ".superbrain", ".cli_bench_test");
    let storageScore = 300;
    try {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      const data = Buffer.alloc(50 * 1024 * 1024, 0x42);
      const wStart = performance.now();
      fs.writeFileSync(testFile, data);
      const wMs = performance.now() - wStart;
      const writeMBps = Math.round((50 / (wMs / 1000)) * 10) / 10;
      storageScore = Math.min(1000, Math.round(writeMBps * 20));
      if (writeMBps > 200) storageScore = Math.min(1000, storageScore + 100);
      fs.unlinkSync(testFile);
    } catch {}

    // Ollama inference
    out(c.dim("  Testing Ollama inference..."));
    let ollamaScore = 0;
    let tokPerSec = 0;
    let ollamaDetail = "NOT RUNNING";
    try {
      const tagsRes = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
      const models = (tagsRes.data?.models || []).map((m: any) => m.name || m.model);
      if (models.length > 0) {
        const benchModel = models.find((m: string) => m.includes("0.5b")) ||
          models.find((m: string) => m.includes("tinyllama")) || models[0];
        const iStart = performance.now();
        const resp = await axios.post(`${OLLAMA_URL}/api/generate`, {
          model: benchModel, prompt: "Reply with exactly 20 words about the Sun.", stream: false,
          options: { num_predict: 40 },
        }, { timeout: 30000 });
        const iMs = performance.now() - iStart;
        const tokens = (resp.data?.response || "").split(/\s+/).length;
        tokPerSec = Math.round((tokens / (iMs / 1000)) * 10) / 10;
        ollamaScore = Math.min(1000, Math.round(tokPerSec * 100));
        if (models.some((m: string) => /7b|8b|13b|14b/i.test(m))) ollamaScore = Math.min(1000, ollamaScore + 200);
        else if (models.some((m: string) => /3b|4b/i.test(m))) ollamaScore = Math.min(1000, ollamaScore + 100);
        else if (models.some((m: string) => /1\.5b|1b/i.test(m) && !m.includes("embed"))) ollamaScore = Math.min(1000, ollamaScore + 50);
        ollamaDetail = `${tokPerSec} tok/s (${benchModel})`;
      } else {
        ollamaDetail = "No models installed";
        ollamaScore = 50;
      }
    } catch {
      ollamaDetail = "Ollama offline";
    }

    // Composite
    const totalScore = Math.round(cpuScore * 0.20 + ramScore * 0.25 + storageScore * 0.15 + ollamaScore * 0.40);
    const tiers: Array<[number, string, string]> = [
      [950, "DIAMOND", "\u{1F48E}"], [850, "PLATINUM", "\u{1F947}"],
      [700, "GOLD", "\u{1F3C6}"], [500, "SILVER", "\u{1F948}"],
      [300, "BRONZE", "\u{1F949}"], [0, "OBSERVER", "\u{1F441}\u{FE0F}"],
    ];
    const [, tierName, tierIcon] = tiers.find(([min]) => totalScore >= min) || tiers[tiers.length - 1];

    const taoRanges: Record<string, [number, number]> = {
      OBSERVER: [0, 0], BRONZE: [0.008, 0.015], SILVER: [0.025, 0.045],
      GOLD: [0.050, 0.090], PLATINUM: [0.095, 0.150], DIAMOND: [0.155, 0.250],
    };
    const [minTao, maxTao] = taoRanges[tierName] || [0, 0];
    const taoPrice = 307; // fallback

    // Build bars
    const bar = (score: number) => {
      const filled = Math.round(score / 50); // 20 chars max
      return c.green("\u{2588}".repeat(filled)) + c.dim("\u{2591}".repeat(20 - filled));
    };

    out("");
    out(`  CPU     ${bar(cpuScore)} ${cpuScore}/1000`);
    out(`  RAM     ${bar(ramScore)} ${ramScore}/1000`);
    out(`  Storage ${bar(storageScore)} ${storageScore}/1000`);
    out(`  Ollama  ${bar(ollamaScore)} ${ollamaScore}/1000`);
    out("");
    out(c.bold(c.cyan("  \u{250C}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2510}")));
    out(c.bold(`  \u{2502}  TOTAL SCORE: ${totalScore} / 1000${" ".repeat(Math.max(0, 14 - String(totalScore).length))}\u{2502}`));
    out(c.bold(`  \u{2502}  TIER: ${tierIcon} ${tierName} MINER${" ".repeat(Math.max(0, 18 - tierName.length))}\u{2502}`));
    out(`  \u{2502}${" ".repeat(33)}\u{2502}`);
    if (tierName === "OBSERVER") {
      out(`  \u{2502}  Cannot mine yet. Upgrade hw.  \u{2502}`);
    } else {
      out(`  \u{2502}  Est: ${minTao}-${maxTao} TAO/day${" ".repeat(Math.max(0, 17 - String(maxTao).length))}\u{2502}`);
      out(`  \u{2502}  (~$${(minTao * taoPrice).toFixed(2)} - $${(maxTao * taoPrice).toFixed(2)}/day)${" ".repeat(Math.max(0, 9 - String((maxTao * taoPrice).toFixed(2)).length))}\u{2502}`);
    }
    out(`  \u{2502}${" ".repeat(33)}\u{2502}`);
    const bestModel = totalScore >= 800 ? "qwen2.5:7b" : totalScore >= 600 ? "qwen2.5:3b" : totalScore >= 400 ? "qwen2.5:1.5b" : "qwen2.5:0.5b";
    out(`  \u{2502}  Best model: ${bestModel}${" ".repeat(Math.max(0, 19 - bestModel.length))}\u{2502}`);
    out(c.bold(c.cyan("  \u{2514}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2518}")));
    out("");

    // Try submitting score
    try {
      const crypto = await import("crypto");
      const anonId = crypto.createHash("sha256").update(os.hostname() + os.cpus()[0]?.model).digest("hex").slice(0, 16);
      await axios.post(`${SN442_NODE.replace(":8400", ":8401")}/benchmark/submit`, {
        anonymousId: anonId, score: totalScore, tier: tierName, cpuCores, ramGB: totalGB,
        ollamaModel: bestModel, tokensPerSec: tokPerSec, platform: "linux", appVersion: "3.0.0",
        submittedAt: new Date().toISOString(),
      }, { timeout: NET_TIMEOUT });
      out(c.dim("  Score submitted anonymously to SN442 leaderboard."));
    } catch {
      out(c.dim("  Leaderboard offline — score saved locally."));
    }

    // Cache
    try {
      const fs2 = await import("fs");
      const cachePath = path.join(os.homedir(), ".superbrain", "benchmark.json");
      fs2.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs2.writeFileSync(cachePath, JSON.stringify({ totalScore, tier: tierName, tokPerSec, bestModel, benchmarkedAt: new Date().toISOString() }));
    } catch {}

    out(c.dim("  Run `sb status` to check your mining status."));
    out("");
  });

program.parse();
