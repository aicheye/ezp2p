# ezp2p

> Lightweight browser P2P multiplayer primitives and example games (dots-and-boxes, tic-tac-toe).

This repository provides a small WebRTC-based peer-to-peer framework and example games built on top of it. The goals are simplicity, low-latency peer-to-peer play with resilient reconnection, and a clear demonstration of basic consensus and registry patterns for multiplayer web games.

Contents
- Overview
- How the registry works
- Consensus model
- P2P protocol
- Security features
- UI / UX
- Development
- Troubleshooting
- Contributing
- License

Overview
--------

ezp2p is a frontend-first project (Vite + React + TypeScript) that demonstrates how to bootstrap peer-to-peer matches in the browser, coordinate game state between players, and handle reconnection scenarios. Example games live under `src/games` and the networking primitives are under `src/networking`.

Key directories
- `src/networking` — core P2P utilities, signaling helpers, message handlers, and peer connection logic.
- `src/games` — game implementations and shared game logic (`dots-and-boxes`, `tic-tac-toe`, plus shared hooks and types).
- `src/components/arcade` — UI pieces for lobby, boot, reconnection, modals, and the arcade shell.

How the registry works
----------------------

Purpose
- The registry tracks active game lobbies and the players associated with them. It is a lightweight discovery mechanism used during the signaling step to route peers into a match.

Data model
- A registry entry (lobby) contains:
  - a lobby code (short human-readable token),
  - game type identifier (eg. `dots-and-boxes`),
  - peer metadata (display name, capabilities), and
  - optionally an initiator/host marker.

Operations
- Create: a client can create a new lobby, which generates a lobby code and broadcasts availability to any discovery endpoint or join flow.
- Join: a joining client provides a lobby code (or selects from local discovery). The registry resolves the code to the initiator(s) and triggers signaling.
- Update/Leave: peers update presence (join/leave) so other participants can react (e.g., show reconnect modal).

Implementation notes
- Registry behavior in this project is implemented in the frontend and in-memory — there is no centralized server-based lobby database. Signaling and discovery are achieved via simple exchange channels (e.g., a short-lived signaling channel, or copy/paste lobby codes) to connect peers for WebRTC.
- See `src/games/registry.ts` for the registry helper and the lobby code generation/validation logic.

Consensus model
----------------

Design goals
- Provide a deterministic, low-latency way for peers to agree on game state with simple conflict handling and robust reconnection.

Approach
- Local-First Updates: each peer applies their own actions immediately and broadcasts them to others.
- Sequence Numbers: messages include monotonically increasing sequence numbers (or per-player logical counters) so peers can order events deterministically.
- Deterministic Resolution: the game logic is written as a deterministic state machine — when events are applied in the same order, all peers converge to the same state.

Conflict handling
- If two peers submit concurrently conflicting moves, the deterministic rules (timestamp/sequence comparison, or player-priority tie-breaker) decide ordering. Conflicts are resolved locally in a way all peers reproduce once ordered messages are applied.

Safety and Liveness
- Periodic state snapshots or state hashes can be exchanged to validate convergence. If divergence is detected, peers can exchange full state and perform a fast reconciliation by replaying ordered events.

Notes for developers
- The project uses simple consensus tailored for turn-based games where actions are small and discrete. For fast-action or large-scale multiplayer, consider stronger protocols (CRDTs, Raft, or an authoritative server).

P2P protocol
------------

Transport
- WebRTC DataChannels for real-time, low-latency peer-to-peer communication. Signaling is performed out-of-band using the lobby code flow (e.g., through a short signaling relay or manual exchange).

Message types (examples)
- `JOIN` — announce intention to join a lobby.
- `OFFER` / `ANSWER` / `ICE` — WebRTC signaling frames during connection setup.
- `GAME_ACTION` — a player action (move) with metadata: {type, playerId, seq, payload}.
- `STATE_SNAPSHOT` — periodic full or delta snapshots for reconciliation.
- `PING` / `PONG` — keepalive and RTT measurement.
- `CONSENSUS_PROPOSE` — when implementing explicit proposals for ordering (optional).

Message format
- Messages are JSON objects with a minimal envelope: `{ type: string, id?: string, seq?: number, ts?: number, payload?: any }`.

Connection flow
1. Player A creates a lobby; a lobby code is generated.
2. Player B enters the lobby code and obtains the minimal signaling info to reach Player A.
3. Peers exchange WebRTC SDP offer/answer and ICE candidates (via signaling channel).
4. When DataChannels are open, peers exchange `JOIN` and initial `STATE_SNAPSHOT` messages.
5. Gameplay messages (`GAME_ACTION`) are exchanged and applied using the consensus rules.

Topology
- Peer mesh for small matches (every peer connects to every other peer). For larger matches, a host/relay or partial mesh may be used to reduce connections.

Security features
-----------------

Built-in protections
- WebRTC transport: communication uses the secure channels provided by the browser (DTLS/SRTP for encrypted DataChannels), so data in transit is encrypted end-to-end between peers.
- Lobby code entropy: lobby tokens are short but generated with reasonable entropy to make brute-force joining unlikely for casual use.
- Origin checks: signaling endpoints (if any) should validate origin and enforce simple rate-limiting.

Message integrity & authentication
- The base project relies on WebRTC's transport security and simple in-message metadata (playerId). For higher security, add message signing (e.g., Ed25519) or authenticated tokens exchanged at lobby creation.

Privacy
- No persistent centralized server is required; ephemeral signaling reduces centralized storage of player metadata.

Replay & tamper protection
- Sequence numbers and timestamps help detect replayed or out-of-order messages. Implement per-message nonces and short-lived tokens for additional protection.

Recommendations for production
- Use an authenticated signaling service to avoid man-in-the-middle on the signaling step.
- Consider adding end-to-end message signing if you need strong non-repudiation or anti-spoofing.

UI / UX
-------

User flows
- Create or Join: simple starting screen for creating a new match or entering a lobby code.
- Lobby: shows connected players and statuses, plus the ability to share the lobby code.
- Match: the game board, clock/timer (if applicable), current turn indicator, and chat/notifications.
- Reconnection: if a peer disconnects, the UI shows a reconnection modal offering to retry automatically. A full state synchronization step happens on reconnection.

Accessibility & feedback
- Visual feedback for connection quality and peer statuses.
- Clear error states and retry buttons for signaling / offer/answer failures.

Components
- `BootScreen`, `LaunchScreen`, `LobbyScreen`, `MainMenu`, and `InGameReconnectionModal` are the main UI building blocks under `src/components/arcade`.

Developer guide
---------------

Prerequisites
- Node 18+ and npm.

Local development
1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

3. Build for production

```bash
npm run build
```

Where to look
- Networking: `src/networking` — examine the connection flow and message handler wiring.
- Registry & game registry helpers: `src/games/registry.ts` and `src/games/registry.*`.
- Game logic: each game folder contains `logic.ts` which implements the deterministic state transitions.

Extending
- Adding a new game
  - Create a new folder under `src/games/<game-name>`.
  - Implement a deterministic `applyAction(state, action)` and the initial `createInitialState()`.
  - Add UI in an `index.tsx` and a board component.
- Changing consensus
  - Adjust message formats and ordering rules in `src/networking/messageHandlers.ts` and the game's `logic.ts` to support new tie-breakers, snapshots, or CRDTs.

Troubleshooting
- Failed WebRTC connections: check browser console for ICE or SDP errors; ensure network allows peer-to-peer (some corporate or mobile networks block direct connections).
- Desynchronized state: request a full `STATE_SNAPSHOT` from a peer and replay events; increase frequency of snapshots for long-running games.

Contributing
- Open a PR with clear intent. Keep game logic deterministic and document any protocol changes.

Files of interest
- `src/networking` — core P2P code and message handlers
- `src/games/registry.ts` — lobby registry helpers
- `src/games/*/logic.ts` — deterministic game rules
- `src/components/arcade` — UI shells and modal components

License
-------
This project is licensed under the MIT License — see the `LICENSE` file for details.

Acknowledgements
- This project is intended as a small educational foundation for building P2P browser games. For production multiplayer systems, consider hardened signaling, authenticated exchange, and proven consensus primitives.
