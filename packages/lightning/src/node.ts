/**
 * The Lightning node: the wasm module, the node object, its keys, and its
 * persistence.
 *
 * Everything LDK writes is written through the store in one transaction per
 * moment of state: the channel manager and the network graph land together,
 * because losing one without the other on a reload is a forced channel
 * close. The reload path is the one LDK documents and this build's typed
 * surface does not wrap, so one function below reaches one level into the
 * bindings to use it, and says so.
 *
 * The socket is not here. The PeerManager is assembled and its bytes go out
 * and come in through the Wire as raw BOLT messages; the data channel that
 * carries them is wires' job, and this node's job is to survive a reload.
 */

import { initializeWasmFromBinary } from "lightningdevkit";
import * as ldk from "lightningdevkit";
import * as ldkBindingsModule from "lightningdevkit/bindings.mjs";
import { pubkeyFromSecretKey } from "@dokwa/keys";
import type { PublicKey } from "@dokwa/core";
import type { LightningStore } from "./store.ts";

/**
 * The bindings' internal surface, which the typed entry does not re-export.
 * The read-with-args path is documented in LDK and untyped here; one cast,
 * one function, and nowhere else in this package reaches into it.
 */
interface LdkBindings {
  encodeUint8Array(bytes: Uint8Array): unknown;
  C2Tuple_ThirtyTwoBytesChannelManagerZ_read(
    bytes: unknown,
    args: unknown,
  ): bigint;
}
const ldkBindings = ldkBindingsModule as unknown as LdkBindings;
import type { Wire } from "@dokwa/core";

/** The HTTP envelope the chain destination parses: method, path, body. */
function chainRequestBytes(request: {
  method?: string;
  path: string;
  body?: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(request));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1)
    bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** A stable 32-bit hash of a peer's wire id, for LDK's descriptor equality. */
function peerHash(peerId: string): bigint {
  let h = 2166136261n;
  for (const byte of new TextEncoder().encode(peerId))
    h = ((h ^ BigInt(byte)) * 16777619n) & 0xffffffffn;
  return h;
}

export type LightningNetwork = "signet";

export interface LightningOptions {
  /** the one secret the node's keys derive from */
  seed: Uint8Array;
  /** the wasm binary, supplied by whatever bundles this package */
  wasm: Uint8Array;
  store: LightningStore;
  /** broadcasts leave through this, and peer bytes arrive over it */
  wire?: Wire;
  network?: LightningNetwork;
}

export interface LightningNode {
  /** the node's id on the network, compressed public key hex */
  readonly nodeId: PublicKey;
  /** how many channels the manager currently knows */
  channels(): number;
  /** how many peers LDK considers connected */
  peers(): number;
  /**
   * Write the node's state in one transaction: the channel manager and the
   * network graph together. Call before the page dies.
   */
  persist(): Promise<void>;
  /** persist, then drop the wasm objects */
  close(): Promise<void>;
  /** whether a channel monitor is on file under this key */
  hasMonitor(hash: number): Promise<boolean>;
  /**
   * Dial a peer over the Wire. `peerId` is the wire's own address for it,
   * `peerNodeId` is LDK's: the compressed public key hex the peer's code
   * handshake named. The Init bytes LDK hands back are sent as the first
   * message; every later message leaves through the descriptor this call
   * registers.
   */
  connectPeer(peerId: string, peerNodeId: string): void;
  /**
   * Register a peer that arrived over the Wire, before its first bytes are
   * read. The data channel belongs to wires; this is only LDK's end of it.
   */
  acceptPeer(peerId: string): void;
  /**
   * Bytes that arrived from a peer, in arrival order, unframed. LDK's own
   * buffering keeps any remainder, so a message split across sends is fine.
   */
  receiveBytes(peerId: string, bytes: Uint8Array): void;
}

let wasmReady = false;

async function ensureWasm(wasm: Uint8Array): Promise<void> {
  if (wasmReady) return;
  await initializeWasmFromBinary(wasm);
  wasmReady = true;
}

export async function openLightning(
  options: LightningOptions,
): Promise<LightningNode> {
  const { seed, wasm, store } = options;
  if (seed.length !== 32)
    throw new Error("dokwa: a lightning seed is exactly 32 bytes");
  await ensureWasm(wasm);

  const network = options.network ?? "signet";
  void network;
  const ldkNetwork = ldk.Network.LDKNetwork_Signet;
  // starting_time must be unique per run: it feeds ephemeral keys only, and
  // the same seed reloaded twice must not see it twice
  const now = Date.now();
  const keys = ldk.KeysManager.constructor_new(seed, BigInt(now), 0, true);
  const nodeId = pubkeyFromSecretKey(keys.get_node_secret_key());

  const logger = ldk.Logger.new_impl({
    log(record: ldk.Record) {
      // the node says what happens to it; a quiet node is an unknowable node
      console.debug(`ldk ${record.get_module_path()}: ${record.get_args()}`);
    },
  });

  // the fee floor LDK enforces; a live estimator is a wire question for later
  const feeest = ldk.FeeEstimator.new_impl({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    get_est_sat_per_1000_weight(_target: ldk.ConfirmationTarget) {
      return 253;
    },
  });

  const broadcaster = ldk.BroadcasterInterface.new_impl({
    broadcast_transactions(txs: Uint8Array[]) {
      if (!options.wire) {
        console.error(
          "ldk: a transaction was ready to broadcast and no Wire is injected",
        );
        return;
      }
      for (const tx of txs) {
        void options.wire
          .request(
            { kind: "chain", network: "signet" },
            chainRequestBytes({ method: "POST", path: "/tx", body: hex(tx) }),
          )
          .then((replied) => {
            if (replied.status !== "ok")
              console.error(
                `ldk: the broadcast did not get ok from the Wire: ${replied.status}`,
              );
          });
      }
    },
  });

  const persister = ldk.Persist.new_impl({
    persist_new_channel(name: ldk.MonitorName, monitor: ldk.ChannelMonitor) {
      // the write is scheduled and reported as in progress: LDK waits rather
      // than assuming
      void store.writeStates([[`monitor:${name.hash()}`, monitor.write()]]);
      return ldk.ChannelMonitorUpdateStatus
        .LDKChannelMonitorUpdateStatus_InProgress;
    },
    update_persisted_channel(
      name: ldk.MonitorName,
      _update: ldk.ChannelMonitorUpdate,
      monitor: ldk.ChannelMonitor,
    ) {
      void store.writeStates([[`monitor:${name.hash()}`, monitor.write()]]);
      return ldk.ChannelMonitorUpdateStatus
        .LDKChannelMonitorUpdateStatus_InProgress;
    },
    archive_persisted_channel(name: ldk.MonitorName) {
      void store.writeStates([
        [`monitor:${name.hash()}:archived`, new Uint8Array(0)],
      ]);
    },
    get_and_clear_completed_updates() {
      return [];
    },
  });

  const netGraphBytes = await store.readState("netgraph");
  let netGraph: ldk.NetworkGraph | null = null;
  if (netGraphBytes && netGraphBytes.length > 0) {
    netGraph = readNetworkGraph(netGraphBytes, logger);
    if (!netGraph) {
      // the graph is gossip, reconstructable from the network; the manager
      // is the money. Losing the graph costs a resync, so it is said out
      // loud and the node still opens on genesis
      console.error(
        "ldk: the stored network graph does not decode; starting from genesis",
      );
    }
  }
  netGraph = netGraph ?? ldk.NetworkGraph.constructor_new(ldkNetwork, logger);

  const scorer = ldk.ProbabilisticScorer.constructor_new(
    ldk.ProbabilisticScoringDecayParameters.constructor_default(),
    netGraph,
    logger,
  );
  const lockable = ldk.MultiThreadedLockableScore.constructor_new(
    scorer.as_Score(),
  );
  const router = ldk.DefaultRouter.constructor_new(
    netGraph,
    logger,
    keys.as_EntropySource(),
    lockable.as_LockableScore(),
    ldk.ProbabilisticScoringFeeParameters.constructor_default(),
  );
  const msgRouter = ldk.DefaultMessageRouter.constructor_new(
    netGraph,
    keys.as_EntropySource(),
  );

  const monitor = ldk.ChainMonitor.constructor_new(
    ldk.Option_FilterZ.constructor_none(),
    broadcaster,
    logger,
    feeest,
    persister,
    keys.as_EntropySource(),
    keys.as_NodeSigner().get_peer_storage_key(),
  );
  const chainWatch = monitor.as_Watch();

  const cfg = ldk.UserConfig.constructor_default();
  const params = ldk.ChainParameters.constructor_new(
    ldkNetwork,
    ldk.BestBlock.constructor_from_network(ldkNetwork),
  );

  const storedManager = await store.readState("channel_manager");
  const manager =
    storedManager && storedManager.length > 0
      ? readChannelManager(
          storedManager,
          keys,
          feeest,
          chainWatch,
          broadcaster,
          router,
          msgRouter,
          logger,
          cfg,
        )
      : ldk.ChannelManager.constructor_new(
          feeest,
          chainWatch,
          broadcaster,
          router.as_Router(),
          msgRouter.as_MessageRouter(),
          logger,
          keys.as_EntropySource(),
          keys.as_NodeSigner(),
          keys.as_SignerProvider(),
          cfg,
          params,
          Math.floor(now / 1000),
        );

  const ignorer = ldk.IgnoringMessageHandler.constructor_new();
  const peerManager = ldk.PeerManager.constructor_new(
    manager.as_ChannelMessageHandler(),
    ignorer.as_RoutingMessageHandler(),
    ignorer.as_OnionMessageHandler(),
    ignorer.as_CustomMessageHandler(),
    monitor.as_SendOnlyMessageHandler(),
    Math.floor(now / 1000),
    keys.as_EntropySource().get_secure_random_bytes(),
    logger,
    keys.as_NodeSigner(),
  );

  // The peers this node has a connection with, keyed by the wire's id for
  // them. LDK produces outbound bytes by calling send_data on the right
  // descriptor, which is where the Wire takes them; inbound bytes are fed
  // to read_event. Nothing here frames anything: LDK does, and the carrier
  // stays byte-exact.
  //
  // Outbound bytes are copied and queued, then flushed after the current
  // wasm call returns. Delivering synchronously from inside send_data would
  // re-enter wasm (the peer's read_event, then its process_events, then back
  // into this node) and the bindings corrupt under that nesting.
  const descriptors = new Map<string, ldk.SocketDescriptor>();
  const outbox: Array<{ peerId: string; bytes: Uint8Array }> = [];

  function flushOutbox(): void {
    while (outbox.length > 0) {
      const item = outbox.shift()!;
      const wire = options.wire;
      if (!wire) continue;
      queueMicrotask(() => {
        void wire.send({ kind: "peer", id: item.peerId }, item.bytes);
      });
    }
  }

  function descriptorFor(peerId: string): ldk.SocketDescriptor {
    const existing = descriptors.get(peerId);
    if (existing) return existing;
    const descriptor = ldk.SocketDescriptor.new_impl({
      send_data(data: Uint8Array): number {
        if (!options.wire) {
          console.error(
            "ldk: outbound peer bytes ready and no Wire is injected",
          );
          return 0;
        }
        // copy: the wasm buffer may be reused once this callback returns
        outbox.push({ peerId, bytes: Uint8Array.from(data) });
        return data.length;
      },
      disconnect_socket() {
        descriptors.delete(peerId);
      },
      // LDK compares descriptors through hash(), and `this` here is the
      // implementation object, never the wrapper, so equality has to be
      // derived from the peer id and not from object identity
      eq(other: ldk.SocketDescriptor) {
        return other.hash() === peerHash(peerId);
      },
      hash() {
        return peerHash(peerId);
      },
    });
    descriptors.set(peerId, descriptor);
    return descriptor;
  }

  return {
    nodeId,

    channels(): number {
      return manager.list_channels().length;
    },

    peers(): number {
      return peerManager.list_peers().length;
    },

    connectPeer(peerId: string, peerNodeId: string): void {
      if (!/^[0-9a-f]{66}$/i.test(peerNodeId))
        throw new Error(
          "ldk: a peer node id is 66 hex characters, the compressed key from its handshake",
        );
      const descriptor = descriptorFor(peerId);
      const init = peerManager.new_outbound_connection(
        hexBytes(peerNodeId.toLowerCase()),
        descriptor,
        ldk.Option_SocketAddressZ.constructor_none(),
      );
      if (!init.is_ok())
        throw new Error(`ldk: the connection to ${peerId} was refused by LDK`);
      const bytes = (init as unknown as { res: Uint8Array }).res;
      if (!options.wire) {
        console.error("ldk: the Init message is ready and no Wire is injected");
        return;
      }
      outbox.push({ peerId, bytes: Uint8Array.from(bytes) });
      flushOutbox();
    },

    acceptPeer(peerId: string): void {
      const descriptor = descriptorFor(peerId);
      const result = peerManager.new_inbound_connection(
        descriptor,
        ldk.Option_SocketAddressZ.constructor_none(),
      );
      if (!result.is_ok())
        throw new Error(
          `ldk: the inbound connection from ${peerId} was refused by LDK`,
        );
    },

    receiveBytes(peerId: string, bytes: Uint8Array): void {
      const descriptor = descriptors.get(peerId);
      if (!descriptor)
        throw new Error(
          `ldk: no peer is registered for ${peerId}; call acceptPeer or connectPeer first`,
        );
      const result = peerManager.read_event(descriptor, bytes);
      if (!result.is_ok()) {
        const failure = (
          result as unknown as { err?: { to_str?: () => string } }
        ).err;
        const reason =
          typeof failure?.to_str === "function"
            ? failure.to_str()
            : String(failure);
        throw new Error(
          `ldk: ${peerId} sent bytes that LDK could not frame: ${reason}`,
        );
      }
      // anything LDK wants to answer leaves through the descriptor's
      // send_data, which queues it; the flush hands it to the Wire after
      // this wasm call has returned
      peerManager.process_events();
      flushOutbox();
    },

    async persist(): Promise<void> {
      await store.writeStates([
        ["channel_manager", manager.write()],
        ["netgraph", netGraph.write()],
      ]);
    },

    async close(): Promise<void> {
      await store.writeStates([
        ["channel_manager", manager.write()],
        ["netgraph", netGraph.write()],
      ]);
      if ("close" in store) {
        (store as unknown as { close(): void }).close();
      }
    },

    async hasMonitor(hash: number): Promise<boolean> {
      const keysWithPrefix = await store.listKeys("monitor:");
      return keysWithPrefix.some((key) => key === `monitor:${hash}`);
    },
  };
}

/**
 * The reload path. LDK documents `(BlockHash, ChannelManager)::read(bytes,
 * args)` and this build's typed surface does not wrap it, so this reaches
 * one level into the bindings for exactly that call and nothing else.
 */
function readChannelManager(
  bytes: Uint8Array,
  keys: ldk.KeysManager,
  feeest: ldk.FeeEstimator,
  chainWatch: ldk.Watch,
  broadcaster: ldk.BroadcasterInterface,
  router: ldk.DefaultRouter,
  msgRouter: ldk.DefaultMessageRouter,
  logger: ldk.Logger,
  cfg: ldk.UserConfig,
): ldk.ChannelManager {
  const args = ldk.ChannelManagerReadArgs.constructor_new(
    keys.as_EntropySource(),
    keys.as_NodeSigner(),
    keys.as_SignerProvider(),
    feeest,
    chainWatch,
    broadcaster,
    router.as_Router(),
    msgRouter.as_MessageRouter(),
    logger,
    cfg,
    [],
  );
  const raw = ldkBindings.C2Tuple_ThirtyTwoBytesChannelManagerZ_read(
    // the bindings encode a byte array with a length prefix and hand back a
    // pointer; the read path wants the encoding its write produced
    ldkBindings.encodeUint8Array(bytes),
    (args as unknown as { ptr: bigint }).ptr,
  );
  // Rust's read consumes ChannelManagerReadArgs by value. The JS wrapper
  // still owns the pointer and its finalizer would free it a second time,
  // which is the "null function or function signature mismatch" the room
  // saw at suite teardown. Detaching the wrapper is what the generated
  // wrappers do after a consuming call.
  detachConsumed(args);
  const result = (
    ldk as unknown as {
      Result_C2Tuple_ThirtyTwoBytesChannelManagerZDecodeErrorZ: {
        constr_from_ptr(ptr: bigint): {
          is_ok(): boolean;
          res: { get_b(): ldk.ChannelManager };
        };
      };
    }
  ).Result_C2Tuple_ThirtyTwoBytesChannelManagerZDecodeErrorZ.constr_from_ptr(
    raw,
  );
  if (!result.is_ok())
    throw new Error(
      "ldk: the stored channel manager does not decode; refusing to continue",
    );
  return result.res.get_b();
}

function readNetworkGraph(
  bytes: Uint8Array,
  logger: ldk.Logger,
): ldk.NetworkGraph | null {
  const result = ldk.NetworkGraph.constructor_read(bytes, logger);
  if (result.is_ok()) {
    const ok = result as unknown as { res: ldk.NetworkGraph };
    return ok.res;
  }
  return null;
}

/**
 * Mark a wrapper whose Rust value was consumed by a by-value call so its
 * finalizer does not free the pointer again. The static lives on CommonBase
 * and every generated wrapper inherits it through its constructor.
 */
function detachConsumed(consumed: object): void {
  const ctor = (consumed as { constructor?: unknown }).constructor as
    { set_null_skip_free?: (o: unknown) => void } | undefined;
  if (typeof ctor?.set_null_skip_free !== "function")
    throw new Error("ldk: the bindings do not expose set_null_skip_free");
  ctor.set_null_skip_free(consumed);
}
