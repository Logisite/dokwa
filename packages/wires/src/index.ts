/**
 * @dokwa/wires: the Wire, relays, chain, peers, the queue, signal.
 *
 * The public surface is one entry point. Everything below it is a file that
 * answers the same two calls: `send`/`onBytes`, and `request` for the chain.
 */

export {
  createWire,
  type WireOptions,
  type WireHandle,
  type RelayVerification,
} from "./wire.ts";
export {
  MemoryQueueStore,
  DexieQueueStore,
  destinationKey,
  type DeliveryResult,
  type QueueItem,
  type QueueStore,
} from "./queue.ts";
export {
  createSignal,
  httpProbe,
  DEFAULT_PROBE_URL,
  type Probe,
  type Signal,
  type SignalOptions,
} from "./signal.ts";
export {
  DEFAULT_SIGNET_ENDPOINT,
  chainRequestBytes,
  type ChainOptions,
  type ChainRequest,
} from "./chain.ts";
export type {
  PeerSignal,
  PeerSignaller,
  PeerOptions,
  PeerState,
} from "./peer.ts";
export type { RelayOptions, RelayState } from "./relay.ts";
