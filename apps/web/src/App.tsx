import { useEffect, useState } from "react";
import { encodeCode, parseCode } from "@dokwa/core";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { CodeBox } from "./components/CodeBox.tsx";
import {
  createRoomWire,
  fundTill,
  openPatron,
  openTill,
  type RoomWire,
  type TillHandle,
  type WalletHandle,
} from "./lib/boot.ts";

const PATRON = "patron";
const HAND_OUT = 5;

function sentence(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function short(key: string): string {
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * The room's first flow, on one origin: a real till and a real wallet in the
 * same page. The till opens with its own keys, funds its float from a real
 * paid quote, and hands out a real token; the wallet takes the code through
 * the same `dokwa:` round trip a camera would, verifies it, swaps it at the
 * till and keeps the fresh proofs.
 *
 * This is the field test for job one, not the finished first run. Every value
 * on the page is read back from the packages; nothing is a fixture.
 */
export default function App() {
  const [till, setTill] = useState<TillHandle | null>(null);
  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [roomWire, setRoomWire] = useState<RoomWire | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [floatBalance, setFloatBalance] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [note, setNote] = useState(
    "Open the till first. It creates its keys and funds its float from a real quote.",
  );
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const nextTill = openTill();
    const nextWallet = openPatron(PATRON, nextTill.mint);
    const nextWire = createRoomWire();
    let live = true;

    setTill(nextTill);
    setWallet(nextWallet);
    setRoomWire(nextWire);

    void (async () => {
      try {
        const [held, purse] = await Promise.all([
          nextTill.float.balance(),
          nextWallet.wallet.balance(),
        ]);
        if (!live) return;
        setFloatBalance(held);
        setWalletBalance(purse);
      } catch (error) {
        if (live) setFailure(sentence(error));
      }
    })();

    return () => {
      live = false;
      nextTill.mintStore.close();
      nextTill.floatStore.close();
      nextWallet.store.close();
      nextWire.close();
    };
  }, []);

  useEffect(() => {
    if (!roomWire) return;
    setOnline(roomWire.wire.isOnline());
    void roomWire.wire.pending().then((items) => setPending(items.length));
    return roomWire.wire.onSignal((signal) => setOnline(signal));
  }, [roomWire]);

  async function openTheTill() {
    if (!till) return;
    setFailure(null);
    try {
      const held = await fundTill(till);
      setFloatBalance(held);
      setOpened(true);
      setNote(
        `The till is open with ${held} sat in its float, signed by its own keyset.`,
      );
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  async function handOut() {
    if (!till) return;
    setFailure(null);
    try {
      const handed = await till.float.send(HAND_OUT, "one token from the till");
      setToken(handed.token);
      setFloatBalance(await till.float.balance());
      setNote(
        `The till is showing ${HAND_OUT} sat. The wallet takes the code the way a camera would.`,
      );
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  async function takeIt() {
    if (!wallet || !token) return;
    setFailure(null);
    try {
      const code = parseCode(encodeCode({ kind: "token", token }));
      if (!code || code.kind !== "token") {
        throw new Error("the code the till drew did not read back as a token");
      }
      const received = await wallet.wallet.receive(code.token);
      const balance = await wallet.wallet.balance();
      setWalletBalance(balance);
      setNote(
        `The wallet received ${received} sat and holds ${balance} sat in fresh proofs.`,
      );
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  return (
    <main>
      <VStack
        gap={5}
        padding={4}
        maxWidth="30rem"
        style={{ margin: "0 auto", minHeight: "100dvh" }}
      >
        <VStack gap={2}>
          <HStack gap={3} align="center" justify="between">
            <Heading level={1} type="display-3">
              dokwa
            </Heading>
            <Badge
              variant={online ? "success" : "warning"}
              label={online ? "signal" : "no signal"}
            />
          </HStack>
          <Text type="supporting" textWrap="pretty">
            The room's first flow: one origin, a real till and a real wallet.
            The mint is in this page, so the wallet calls it in process; the
            code below is drawn from the same dokwa: text a camera reads.
          </Text>
        </VStack>

        {failure ? (
          <Banner
            status="error"
            title="That did not work"
            description={failure}
            collapsible={false}
          />
        ) : null}

        <Card padding={4}>
          <VStack gap={3}>
            <HStack justify="between" align="center" gap={3}>
              <Heading level={2}>The till</Heading>
              <Text type="supporting">{opened ? "open" : "closed"}</Text>
            </HStack>
            <Text type="supporting">
              mint key {till ? short(till.identity.pubkey) : "opening"}
            </Text>
            <HStack justify="between" align="center" gap={3}>
              <Text>Float</Text>
              <Text type="code">
                {floatBalance === null ? "..." : `${floatBalance} sat`}
              </Text>
            </HStack>
            <Button
              label="Open the till"
              variant="primary"
              width="100%"
              isDisabled={!till || opened}
              clickAction={openTheTill}
            />
            <Button
              label={`Hand out ${HAND_OUT} sat`}
              width="100%"
              isDisabled={!opened}
              clickAction={handOut}
            />
            {token ? (
              <VStack gap={3}>
                <CodeBox
                  text={encodeCode({ kind: "token", token })}
                  label="The token the till is handing out"
                />
                <Text type="code" wordBreak="break-all">
                  {token}
                </Text>
              </VStack>
            ) : null}
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={3}>
            <HStack justify="between" align="center" gap={3}>
              <Heading level={2}>The wallet</Heading>
              <Text type="supporting">
                {wallet ? short(wallet.identity.pubkey) : "opening"}
              </Text>
            </HStack>
            <HStack justify="between" align="center" gap={3}>
              <Text>Holds</Text>
              <Text type="code">
                {walletBalance === null ? "..." : `${walletBalance} sat`}
              </Text>
            </HStack>
            <Button
              label="Take the code"
              variant="primary"
              width="100%"
              isDisabled={!wallet || !token}
              clickAction={takeIt}
            />
            <Text type="supporting">
              The wallet verifies every proof against the till's public keyset,
              swaps at the till into fresh coins, and keeps only those. A second
              take of the same token is refused by the spent list.
            </Text>
          </VStack>
        </Card>

        <VStack gap={1}>
          <Text type="supporting" textWrap="pretty">
            {note}
          </Text>
          <Text type="supporting">
            queued: {pending} · storage: this origin
          </Text>
        </VStack>
      </VStack>
    </main>
  );
}
