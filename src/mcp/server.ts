#!/usr/bin/env bun
/**
 * SuperBrain MCP Server — SN442 Knowledge Network
 *
 * Exposes SuperBrain's decentralized knowledge network as MCP tools.
 * Any MCP-compatible AI (Claude Code, Cursor, Windsurf) can query SN442.
 *
 * Usage: bun run mcp (stdio transport for MCP clients)
 * Config: Add to ~/.claude/mcp.json as "superbrain" server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const SN442_NODE = process.env.SN442_NODE || "http://46.225.114.202:8400";

const server = new Server(
  {
    name: "superbrain-sn442",
    version: "2.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// -- Tool Definitions --

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "query_superbrain",
      description:
        "Query validated knowledge from the Bittensor SN442 decentralized P2P network. " +
        "Returns answers backed by validator-scored knowledge chunks. " +
        "Use for real-time, specialized, or privacy-preserving knowledge retrieval.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The question or topic to query the knowledge network about",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_network_stats",
      description:
        "Get live health metrics for SuperBrain Subnet 442 — " +
        "validator rounds, peer count, knowledge chunks, and node status.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ],
}));

// -- Tool Handlers --

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "query_superbrain") {
    const query = (args as Record<string, unknown>)?.query as string;
    if (!query) {
      return {
        content: [{ type: "text" as const, text: "Error: 'query' argument is required." }],
        isError: true,
      };
    }

    try {
      const response = await axios.post(
        `${SN442_NODE}/query`,
        { prompt: query },
        { timeout: 10000 }
      );

      const answer = response.data.answer || response.data.response || JSON.stringify(response.data);
      const confidence = response.data.confidence || "validated";
      const source = response.data.source || "SN442 P2P Network";

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `[SuperBrain SN442 — Validated Knowledge]`,
              ``,
              answer,
              ``,
              `---`,
              `Confidence: ${confidence}`,
              `Source: ${source}`,
              `Node: ${SN442_NODE}`,
            ].join("\n"),
          },
        ],
      };
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || "Unknown error";
      return {
        content: [{ type: "text" as const, text: `SuperBrain node unreachable: ${msg}` }],
        isError: true,
      };
    }
  }

  if (name === "get_network_stats") {
    try {
      // Hit multiple endpoints in parallel for a full picture
      const [health, knowledge, peers, validatorLog] = await Promise.allSettled([
        axios.get(`${SN442_NODE}/health`, { timeout: 10000 }),
        axios.get(`${SN442_NODE}/knowledge`, { timeout: 10000 }),
        axios.get(`${SN442_NODE}/peers`, { timeout: 10000 }),
        axios.get(`${SN442_NODE}/validator-log`, { timeout: 10000 }),
      ]);

      const healthOk = health.status === "fulfilled" ? "ONLINE" : "OFFLINE";
      const chunkCount =
        knowledge.status === "fulfilled"
          ? Array.isArray(knowledge.value.data)
            ? knowledge.value.data.length
            : knowledge.value.data?.chunks?.length || "unknown"
          : "unavailable";
      const peerCount =
        peers.status === "fulfilled"
          ? Array.isArray(peers.value.data)
            ? peers.value.data.length
            : peers.value.data?.peers?.length || "unknown"
          : "unavailable";

      // Extract latest round from validator log
      let latestRound = "unknown";
      if (validatorLog.status === "fulfilled") {
        const log = validatorLog.value.data;
        const logText = typeof log === "string" ? log : JSON.stringify(log);
        const roundMatch = logText.match(/step[:\s]*(\d+)/i);
        if (roundMatch) latestRound = roundMatch[1];
      }

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `SuperBrain SN442 Network Status`,
              `================================`,
              `Node:             ${SN442_NODE}`,
              `Status:           ${healthOk}`,
              `Knowledge Chunks: ${chunkCount}`,
              `Connected Peers:  ${peerCount}`,
              `Validator Round:  ${latestRound}`,
              `Subnet:           Bittensor SN442 (Testnet)`,
            ].join("\n"),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `Failed to fetch network stats: ${error.message}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// -- Start Server --

const transport = new StdioServerTransport();
await server.connect(transport);
