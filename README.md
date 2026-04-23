# superbrain-cli

`sb` — the command-line client for the **SuperBrain SN442** decentralized knowledge network on Bittensor.

Ask the network, share knowledge, benchmark your hardware, sync peers — from one terminal binary, with no cloud dependency. Local Ollama inference is tried first; the network is used as a fallback and cross-reference.

## Install

```bash
bun install
bun run build   # produces ./sb binary
./sb --help
```

Or add the binary to your `PATH`:

```bash
sudo cp sb /usr/local/bin/
sb --help
```

Node 18+ also works, but Bun is the supported runtime.

## Configuration

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `SN442_NODE` | `http://46.225.114.202:8400` | Override the SN442 API endpoint |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama daemon URL |
| `SB_MODEL` | `qwen2.5:0.5b` | Default local model for `ask` |

All network calls are hard-capped at 10 seconds — `sb` will never hang.

## Commands

| Command | Description |
|---|---|
| `sb ask <question>` | Query the decentralized knowledge network. Tries local Ollama first, then cross-references SN442. Flags: `-l/--local`, `-n/--network`, `-m/--model`. |
| `sb status` | Check SN442 network health (validator, miner, sync node, demo API). |
| `sb peers` | List connected peers in the network with their chunk counts and location. |
| `sb sync` | Pull knowledge directly from all known peers into the local store. |
| `sb share <text>` | Share knowledge to the SN442 network (permanent, signed). Flags: `--title`, `--hotkey`. |
| `sb benchmark` | Score your hardware for SN442 mining (CPU, RAM, disk, Ollama latency). |
| `sb ingest-zim <path>` | Ingest ZIM (offline Wikipedia) articles into SN442 network and/or local Qdrant. |

Run `sb <command> --help` for per-command options.

## Examples

```bash
# Ask a question (local + network cross-reference)
sb ask what is bittensor subnet 442

# Network-only query (skip local Ollama)
sb ask --network "latest TAO emission rate"

# Share a note
sb share "The validator scores on 4 factors: supportedness, relevance, novelty, latency" \
  --title "SN442 scoring" \
  --hotkey 5EHQh8frNHpjY5Cw7HuPiNgN4DotBYXWnHk2dvDFbQqJmUTavk

# Run a hardware benchmark
sb benchmark
```

## Development

```bash
bun install
bun run src/index.ts ask "hello"
bun test
```

## License

MIT. See [LICENSE](LICENSE).

## Links

- Subnet protocol: https://github.com/KatchDaVizion/superbrain-subnet
- Desktop app: https://github.com/KatchDaVizion/superbrain-sandbox-mempalace
- Node SDK: https://github.com/KatchDaVizion/superbrain-sdk
