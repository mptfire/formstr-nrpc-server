# FORMSTR NRPC Server

A Nostr RPC-over-Events server providing remote procedure call capabilities through the Nostr protocol. Features reminders, scheduled posts, and AI-powered interactions via Ollama.

## Features

- **RPC over Nostr**: Execute remote procedures through Nostr events (NIP-68/69)
- **Reminders**: Schedule and receive reminder notifications
- **Scheduled Posts**: Queue posts for future publishing
- **AI Integration**: Powered by local Ollama instance for AI capabilities
- **Gift-Wrapped Support**: Private RPC calls using NIP-44 encryption
- **Health Monitoring**: Automatic health checks and service recovery

## Prerequisites

- Node.js 18+ and npm
- A Nostr private key (nsec)
- (Optional) Docker & Docker Compose
- (Optional) [Ollama](https://ollama.ai) for AI features

## Installation

### Option 1: Running with Docker Compose (Recommended)

1. Clone the repository
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and configure your settings:
   ```bash
   # Required
   NSEC=nsec1your_private_key_here
   PUBKEY=your_pubkey_hex_here

   # Ollama (required for AI features)
   OLLAMA_BASE_URL=http://host.docker.internal:11434

   # Optional: Configure relays, service info, etc.
   ```

4. Build and start the service:
   ```bash
   docker compose up -d
   ```

5. View logs:
   ```bash
   docker compose logs -f
   ```

### Option 2: Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy and configure `.env`:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NSEC` | Your Nostr private key | Yes | - |
| `PUBKEY` | Your public key (hex) | Yes | - |
| `RELAYS` | Comma-separated relay URLs | No | Default relay set |
| `SERVICE_NAME` | Display name for your service | No | NRPC Backend Service |
| `SERVICE_ABOUT` | Service description | No | - |
| `OLLAMA_BASE_URL` | Ollama API endpoint | No | http://127.0.0.1:11434 |

See `.env.example` for all available options.

### Ollama Setup

For AI features, you need a running Ollama instance:

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model (e.g., `ollama pull llama2`)
3. Set `OLLAMA_BASE_URL` in `.env`:
   - **Local**: `http://127.0.0.1:11434`
   - **Docker**: `http://host.docker.internal:11434` (to access host's Ollama)

## Health Monitoring

The service includes automatic health checks:

- **Health check interval**: Every 60 seconds
- **Restart after**: 3 consecutive failures (3 minutes)
- **Heartbeat interval**: Every 5 minutes
- **Heartbeat restart**: After 2 consecutive failures (10 minutes)

Health checks verify the service can process Nostr RPC requests. The container will automatically restart on persistent failures.

## Available Methods

Query available methods by sending a `getMethods` RPC request. Current methods include:

- `getMethods` - List all available RPC methods
- `createReminder` - Schedule a reminder notification
- `schedulePost` - Queue a post for future publishing
- AI-powered methods (when Ollama is configured)

---

# Nostr RPC Protocol

## Request Event (kind: 22068)

- `author`: caller pubkey
- `tags`:
  - `["p", "<callee_pubkey>"]`
  - `["method", "<method_name>"]`
  - `["param", "<key>", "<value>"]` (repeatable)

## Response Event (kind: 22069)

- `author`: callee pubkey
- `tags`:
  - `["e", "<request_event_id>"]`
  - `["p", "<caller_pubkey>"]`
  - `["status", "<http_status_code>"]`
  - On success:
    - `["result", "<key>", "<value>"]` (repeatable)
    - `["result_json", "<json_string>"]` (optional)
  - On error:
    - `["error", "<http_status_code>", "<message>"]`

## Encrypted Requests (Gift Wrap - NIP-44)

For private RPC calls, use gift-wrapped events (kind: 21169) with NIP-44 encryption.

### Rumor Kinds

- **Request rumor**: kind **68** (inside gift wrap)
- **Response rumor**: kind **69** (inside gift wrap)

Note: These differ from public requests (kind 22068) and responses (kind 22069).

### How it works

1. Create your RPC request as a **rumor** (kind **68**, unsigned event) with the same structure as a public request
2. Encrypt it using NIP-44 gift wrap (kind 21169) to the service's pubkey
3. Service unwraps, processes the rumor, and responds with a gift-wrapped response
4. Response rumor (kind **69**) is tagged with `["e", "<request_rumor_id>"]`

### Gift Wrap Structure

```json
{
  "kind": 21169,
  "pubkey": "random_throwaway_pubkey",
  "content": "<nip44_encrypted_content>",
  "tags": [
    ["p", "service_pubkey"]
  ]
}
```

## Example Request/Response

### Request: Create Reminder (Public)

```json
{
  "kind": 22068,
  "author": "npub1caller...",
  "tags": [
    ["p", "npub1service..."],
    ["method", "createReminder"],
    ["param", "time", "2025-09-17T09:00:00Z"],
    ["param", "text", "Doctor appointment"],
    ["param", "notify", "true"]
  ],
  "content": ""
}
```

### Success Response

```json
{
  "kind": 22069,
  "author": "npub1service...",
  "tags": [
    ["e", "id_of_request_event"],
    ["p", "npub1caller..."],
    ["status", "200"],
    ["result", "reminder_id", "rem123"],
    ["result", "scheduled_at", "2025-09-17T09:00:00Z"]
  ],
  "content": ""
}
```

### Error Response

```json
{
  "kind": 22069,
  "author": "npub1service...",
  "tags": [
    ["e", "id_of_request_event"],
    ["p", "npub1caller..."],
    ["status", "400"],
    ["error", "400", "invalid time format"]
  ],
  "content": ""
}
```

### Request: Create Reminder (Encrypted)

**Gift wrap** (kind 21169):
```json
{
  "kind": 21169,
  "pubkey": "random_ephemeral_key",
  "content": "<nip44_encrypted_content>",
  "tags": [
    ["p", "service_pubkey"]
  ],
  "created_at": 1234567890,
  "sig": "..."
}
```

**Decrypted rumor** (kind **68**):
```json
{
  "kind": 68,
  "pubkey": "caller_pubkey",
  "tags": [
    ["p", "service_pubkey"],
    ["method", "createReminder"],
    ["param", "time", "2025-09-17T09:00:00Z"],
    ["param", "text", "Doctor appointment"]
  ],
  "content": "",
  "created_at": 1234567890,
  "id": "rumor_event_id_xyz"
}
```

### Encrypted Response

The service responds with a gift-wrapped response. The response has two layers of event references:

**Response gift wrap** (kind **21169**):
```json
{
  "kind": 21169,
  "pubkey": "random_ephemeral_key",
  "content": "<nip44_encrypted_content>",
  "tags": [
    ["e", "rumor_event_id_xyz"]
  ],
  "created_at": 1234567890
}
```
Note: The gift wrap is tagged with the **request rumor's ID** (`rumor_event_id_xyz`).

**Decrypted response rumor** (kind **69**):
```json
{
  "kind": 69,
  "pubkey": "service_pubkey",
  "tags": [
    ["e", "gift_wrap_event_id_abc"],
    ["p", "caller_pubkey"],
    ["status", "200"],
    ["result", "reminder_id", "rem123"]
  ],
  "content": "",
  "created_at": 1234567890,
  "id": "response_rumor_id_123"
}
```
Note: The response rumor is tagged with the **request gift wrap's ID** (`gift_wrap_event_id_abc`).

## License

MIT
