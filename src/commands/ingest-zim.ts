/**
 * ingest-zim — Read ZIM articles and submit chunks to SN442 network + optional local Qdrant.
 *
 * Usage:
 *   sb ingest-zim [options] <zim-path>
 *   sb ingest-zim --limit 100 ~/.superbrain/zim/wikipedia-simple.zim
 *   sb ingest-zim --dry-run mock          # dry run with mock data
 *   sb ingest-zim --network-only <path>   # skip local, only submit to SN442
 *   sb ingest-zim --local-only <path>     # skip network, only index locally
 */

import { Command } from 'commander'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'

const SEED = process.env.SB_SEED || 'http://46.225.114.202:8400'
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333'
const RATE_LIMIT_MS = 800  // 1 request per 800ms
const SUBMIT_TIMEOUT = 5000

interface ZimChunk {
  title: string
  content: string
  source: string
}

/**
 * Crude ZIM text extraction via kiwix-serve search API.
 * For a real ZIM parser we'd use @openzim/libzim — this approach
 * uses the running kiwix-serve instance to fetch articles.
 */
async function extractArticlesFromKiwix(limit: number): Promise<ZimChunk[]> {
  const KIWIX_URL = 'http://localhost:8383'
  const chunks: ZimChunk[] = []

  // Use kiwix-serve search with broad queries to discover articles
  const seedQueries = [
    'science', 'history', 'technology', 'mathematics', 'biology',
    'physics', 'chemistry', 'geography', 'philosophy', 'medicine',
    'computer', 'engineering', 'art', 'music', 'literature',
    'economics', 'politics', 'language', 'religion', 'astronomy',
  ]

  for (const query of seedQueries) {
    if (chunks.length >= limit) break

    try {
      const searchResp = await axios.get(`${KIWIX_URL}/search`, {
        params: { pattern: query, pageLength: Math.min(10, limit - chunks.length) },
        timeout: 5000,
      })

      // Extract article links from search HTML
      const linkPattern = /<a[^>]+href="(\/[^"]+)"[^>]*>([^<]+)<\/a>/g
      let match: RegExpExecArray | null
      const html = searchResp.data as string

      while ((match = linkPattern.exec(html)) !== null) {
        if (chunks.length >= limit) break

        const articleUrl = match[1]
        const title = match[2].trim()

        // Skip navigation/UI links
        if (articleUrl.includes('/search') || articleUrl.includes('/skin/') || articleUrl === '/' || title.length < 3) continue

        // Fetch full article text
        try {
          const articleResp = await axios.get(`${KIWIX_URL}${articleUrl}`, { timeout: 5000 })
          const text = (articleResp.data as string)
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

          if (text.length < 100) continue

          // Split long articles into ~1500 char chunks
          const chunkSize = 1500
          for (let i = 0; i < text.length; i += chunkSize) {
            if (chunks.length >= limit) break
            chunks.push({
              title,
              content: text.substring(i, i + chunkSize).trim(),
              source: 'wikipedia-simple-en',
            })
          }
        } catch {
          // Article fetch failed — continue
        }
      }
    } catch {
      // Search query failed — continue
    }
  }

  return chunks
}

function createMockChunks(limit: number): ZimChunk[] {
  const topics = [
    { title: 'Photosynthesis', content: 'Photosynthesis is the process by which plants convert sunlight into chemical energy. It occurs in chloroplasts using chlorophyll pigments. The process produces oxygen as a byproduct and is essential for life on Earth.' },
    { title: 'Bittensor', content: 'Bittensor is a decentralized machine learning network that rewards AI models with TAO tokens. It uses a blockchain-based incentive mechanism to create an open marketplace for artificial intelligence.' },
    { title: 'Subnet 442', content: 'Subnet 442 is the SuperBrain knowledge subnet on Bittensor. It enables decentralized knowledge sharing where miners contribute validated knowledge chunks and earn TAO tokens in return.' },
  ]
  return topics.slice(0, limit).map((t) => ({ ...t, source: 'mock-data' }))
}

async function submitChunkToSN442(chunk: ZimChunk): Promise<boolean> {
  try {
    await axios.post(
      `${SEED}/knowledge/add`,
      {
        content: chunk.content,
        title: chunk.title,
        source: chunk.source,
        license: 'CC-BY-SA-4.0',
        tags: ['wikipedia', 'encyclopedia', 'offline-seed'],
        submitter: 'sb-zim-ingestor-v1',
      },
      { timeout: SUBMIT_TIMEOUT }
    )
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Command Definition ───────────────────────────────────────────────────

export function registerIngestZimCommand(program: Command) {
  program
    .command('ingest-zim')
    .description('Ingest ZIM articles into SN442 network and/or local Qdrant')
    .argument('<zim-path>', 'Path to .zim file or "mock" for test data')
    .option('-l, --limit <n>', 'Max chunks to process', '50')
    .option('--dry-run', 'Show what would be submitted without actually doing it')
    .option('--network-only', 'Skip local Qdrant, only submit to SN442')
    .option('--local-only', 'Skip SN442, only index locally in Qdrant')
    .action(async (zimPath: string, options) => {
      const limit = parseInt(options.limit) || 50
      const dryRun = !!options.dryRun
      const networkOnly = !!options.networkOnly
      const localOnly = !!options.localOnly

      const isTTY = process.stdout.isTTY ?? false
      const green = (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s
      const yellow = (s: string) => isTTY ? `\x1b[33m${s}\x1b[0m` : s
      const dim = (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s
      const red = (s: string) => isTTY ? `\x1b[31m${s}\x1b[0m` : s
      const bold = (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s
      const out = (s: string) => process.stdout.write(s + '\n')

      out('')
      out(bold('[ZIM] SuperBrain ZIM Ingestor'))
      out(dim(`  Source: ${zimPath === 'mock' ? 'mock test data' : zimPath}`))
      out(dim(`  Limit: ${limit} chunks | Mode: ${dryRun ? 'DRY RUN' : networkOnly ? 'network-only' : localOnly ? 'local-only' : 'local + network'}`))
      out('')

      // Extract or generate chunks
      let chunks: ZimChunk[]
      if (zimPath === 'mock') {
        chunks = createMockChunks(limit)
        out(dim(`  Generated ${chunks.length} mock chunk(s)`))
      } else {
        if (!fs.existsSync(zimPath) && zimPath !== 'mock') {
          out(red(`[!] ZIM file not found: ${zimPath}`))
          out(dim('  Attempting to read from running kiwix-serve instead...'))
        }

        out(dim('  Extracting articles from kiwix-serve...'))
        chunks = await extractArticlesFromKiwix(limit)

        if (chunks.length === 0) {
          out(yellow('[!] No articles extracted. Is kiwix-serve running on port 8383?'))
          process.exit(1)
        }

        out(dim(`  Extracted ${chunks.length} chunk(s) from kiwix-serve`))
      }

      out('')

      // Dry run
      if (dryRun) {
        out(yellow(`[DRY RUN] Would submit ${chunks.length} chunk(s) to SN442`))
        chunks.slice(0, 3).forEach((c, i) => {
          out(dim(`  ${i + 1}. "${c.title}" (${c.content.length} chars)`))
        })
        if (chunks.length > 3) out(dim(`  ... and ${chunks.length - 3} more`))
        out('')
        return
      }

      // Submit to SN442 network
      let networkSubmitted = 0
      let networkFailed = 0

      if (!localOnly) {
        out(dim('[ZIM] Submitting chunks to SN442...'))

        for (let i = 0; i < chunks.length; i++) {
          const ok = await submitChunkToSN442(chunks[i])
          if (ok) {
            networkSubmitted++
          } else {
            networkFailed++
          }

          // Progress every 10 chunks or on last
          if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
            out(`  [ZIM] Submitted ${networkSubmitted} / ${chunks.length} chunks to SN442...${networkFailed > 0 ? ` (${networkFailed} failed)` : ''}`)
          }

          // Rate limit
          if (i < chunks.length - 1) await sleep(RATE_LIMIT_MS)
        }

        out('')
        if (networkSubmitted > 0) {
          out(green(`[+] ${networkSubmitted} chunk(s) submitted to SN442 network`))
        }
        if (networkFailed > 0) {
          out(yellow(`[~] ${networkFailed} chunk(s) failed (Frankfurt may be unreachable)`))
        }
      }

      // Local Qdrant indexing
      if (!networkOnly) {
        out(dim('[ZIM] Local Qdrant indexing not yet implemented in CLI — use desktop app RAG ingest'))
      }

      out('')
      out(dim(`  Total: ${chunks.length} chunks processed`))
      out(dim(`  Network: ${networkSubmitted} submitted, ${networkFailed} failed`))
      out('')
    })
}
