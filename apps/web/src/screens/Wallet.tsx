import { useEffect, useState } from "react";
import { parseCode } from "@dokwa/core";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import {
  createRoomWire,
  noTillLink,
  openPatron,
  reopenWallet,
  type RoomWire,
  type WalletHandle,
} from "../lib/boot.ts";
import {
  createCodeSignaller,
  type CodeSignaller,
} from "../lib/code-signaller.ts";
import { openWalletOverPeer } from "../lib/peer.ts";

function sentence(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tillIdFrom(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("dokwa:")) {
    const code = parseCode(trimmed);
    return code?.kind === "peer" && /^[0-9a-f]{64}$/i.test(code.id)
      ? code.id
      : null;
  }
  return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : null;
}

/**
 * The wallet on its own device. The purse and the key are real. A till is
 * reached either over the relay signaller when there is signal, or by hand
 * with peer codes when there is none. Before either, the screen says so.
 */
export default function Wallet() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [wire, setWire] = useState<RoomWire | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [tillCode, setTillCode] = useState("");
  const [tillId, setTillId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"relay" | "code">("relay");
  const [codeSignaller, setCodeSignaller] = useState<CodeSignaller | null>(
    null,
  );
  const [outgoingCode, setOutgoingCode] = useState<string | null>(null);
  const [incomingCode, setIncomingCode] = useState("");
  const [incoming, setIncoming] = useState("");
  const [sendAmount, setSendAmount] = useState("5");
  const [sent, setSent] = useState<string | null>(null);
  const [note, setNote] = useState("This wallet has a key and an empty purse.");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [peerState, setPeerState] = useState<string>("no peer");

  useEffect(() => {
    const next = openPatron("me", noTillLink());
    const nextWire = createRoomWire(next.identity);
    let live = true;
    setWallet(next);
    setWire(nextWire);
    void next.wallet
      .balance()
      .then((held) => {
        if (live) setBalance(held);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      nextWire.close();
      next.store.close();
    };
  }, []);

  useEffect(() => {
    if (!wire) return;
    void wire.wire.pending().then((items) => setPending(items.length));
    const offResult = wire.wire.onResult(() => {
      void wire.wire.pending().then((items) => setPending(items.length));
    });
    const offPeer = wire.wire.onPeerState((_id, state) => setPeerState(state));
    return () => {
      offResult();
      offPeer();
    };
  }, [wire]);

  async function refresh() {
    if (!wallet) return;
    setBalance(await wallet.wallet.balance());
  }

  async function connect(choice: "relay" | "code") {
    if (!wallet || !wire) return;
    const id = tillIdFrom(tillCode);
    if (!id) {
      setFailure("paste the till's peer code, or its 64 character key");
      return;
    }
    setFailure(null);
    try {
      if (choice === "relay") {
        await wire.signaller?.ready;
      } else {
        const signaller = createCodeSignaller(wallet.identity);
        wire.wire.setPeerSignaller(signaller);
        signaller.onCode(setOutgoingCode);
        setCodeSignaller(signaller);
      }
      // A hand-carried offer and answer take longer than a relay round trip.
      const link = openWalletOverPeer(
        wire.wire,
        id,
        choice === "code" ? 300_000 : 60_000,
      );
      setWallet(reopenWallet(wallet, link));
      setTillId(id);
      setMode(choice);
      void Promise.resolve(link.keys())
        .then(() => {
          setConnected(true);
          setNote(
            `Connected to ${id.slice(0, 8)}... over ${choice}. The channel is open.`,
          );
        })
        .catch((error: unknown) => setFailure(sentence(error)));
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  function deliverCode() {
    setFailure(null);
    if (!codeSignaller?.deliver(incomingCode.trim())) {
      setFailure("that is not a peer code from the till");
      return;
    }
    setIncomingCode("");
  }

  async function takeIn() {
    if (!wallet) return;
    setFailure(null);
    try {
      const trimmed = incoming.trim();
      const code = trimmed.startsWith("dokwa:") ? parseCode(trimmed) : null;
      const value = code?.kind === "token" ? code.token : trimmed;
      if (!value.startsWith("cashu")) {
        throw new Error("that is not a token or a dokwa: code");
      }
      const received = await wallet.wallet.receive(value);
      await refresh();
      setIncoming("");
      setNote(`Took in ${received} sat.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function send() {
    if (!wallet) return;
    setFailure(null);
    try {
      const amount = Number(sendAmount);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("an amount is a positive whole number of sats");
      }
      const made = await wallet.wallet.send(amount, "from this wallet");
      setSent(made.token);
      await refresh();
      setNote(`Sent ${amount} sat in a code.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Page>
      <VStack gap={3}>
        <HStack justify="between" align="center" gap={3}>
          <Heading level={1}>Wallet</Heading>
          <HStack gap={1}>
            <Button
              label="Scan"
              variant="ghost"
              onClick={() => navigate("/scan")}
            />
            <Button
              label="Home"
              variant="ghost"
              onClick={() => navigate("/")}
            />
          </HStack>
        </HStack>
        <HStack justify="between" align="center" gap={3}>
          <Text weight="semibold">Holds</Text>
          <Text type="code">{balance === null ? "..." : `${balance} sat`}</Text>
        </HStack>
        <Text type="supporting" wordBreak="break-all">
          {wallet ? wallet.identity.pubkey : "opening"}
        </Text>
      </VStack>

      {failure ? (
        <Card variant="muted" padding={3}>
          <Text type="supporting" textWrap="pretty">
            {failure}
          </Text>
        </Card>
      ) : null}

      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Connect to a till</Heading>
          {connected ? (
            <Text type="supporting" textWrap="pretty">
              Connected to {tillId?.slice(0, 8)}... over {mode}. Receive and
              send now go through the frame to this till. Cash out is still a
              sentence, because the mint cannot melt yet.
            </Text>
          ) : tillId ? (
            <Text type="supporting" textWrap="pretty">
              Opening a channel to {tillId.slice(0, 8)}... over {mode}. The
              first call is waiting for the peer to answer.
            </Text>
          ) : (
            <Text type="supporting" textWrap="pretty">
              Paste the till&apos;s peer code, then choose a path. Relay opens
              the channel automatically when there is signal. Codes work with
              both radios off, one code each way.
            </Text>
          )}
          {!connected ? (
            <>
              <TextArea
                label="Till code"
                value={tillCode}
                onChange={setTillCode}
                rows={3}
                placeholder="dokwa:... or the till's public key"
                width="100%"
              />
              <HStack gap={2}>
                <Button
                  label="By relay"
                  variant="primary"
                  onClick={() => void connect("relay")}
                />
                <Button label="By code" onClick={() => void connect("code")} />
              </HStack>
            </>
          ) : null}
          {mode === "code" && !connected ? (
            <VStack gap={3}>
              {outgoingCode ? (
                <VStack gap={1}>
                  <Text type="supporting">Give this code to the till</Text>
                  <Text type="code" wordBreak="break-all">
                    {outgoingCode}
                  </Text>
                </VStack>
              ) : null}
              <TextArea
                label="Code from the till"
                value={incomingCode}
                onChange={setIncomingCode}
                rows={3}
                placeholder="dokwa:..."
                width="100%"
              />
              <Button
                label="Deliver it"
                width="100%"
                isDisabled={incomingCode.trim().length === 0}
                onClick={deliverCode}
              />
            </VStack>
          ) : null}
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Receive a code</Heading>
          <TextInput
            label="Code"
            value={incoming}
            onChange={setIncoming}
            placeholder="cashu:... or dokwa:..."
            autoCapitalize="off"
            autoComplete="off"
            hasAutoCorrect={false}
            width="100%"
          />
          <Button
            label="Take it in"
            width="100%"
            size="lg"
            isDisabled={!wallet || incoming.trim().length === 0}
            onClick={takeIn}
          />
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Send</Heading>
          <TextInput
            label="Amount in sat"
            value={sendAmount}
            onChange={setSendAmount}
            inputMode="numeric"
            width="100%"
          />
          <Button
            label="Make a code"
            width="100%"
            size="lg"
            isDisabled={!wallet || (balance ?? 0) <= 0}
            onClick={send}
          />
          {sent ? (
            <Text type="code" wordBreak="break-all">
              {sent}
            </Text>
          ) : null}
        </VStack>
      </Card>

      <Card variant="muted" padding={4}>
        <VStack gap={2}>
          <Text weight="semibold">Cash out</Text>
          <Text type="supporting" textWrap="pretty">
            The till cannot melt ecash to an address yet, so this wallet cannot
            cash out. An address field here would be a spinner that never stops.
          </Text>
        </VStack>
      </Card>

      <Text type="supporting" textWrap="pretty">
        {note}
      </Text>

      <HStack justify="between" align="center" gap={3}>
        <Text type="supporting">peer: {peerState}</Text>
        <Text type="supporting">queued: {pending}</Text>
      </HStack>
    </Page>
  );
}
