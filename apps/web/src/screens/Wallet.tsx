import { useEffect, useState } from "react";
import { parseCode } from "@dokwa/core";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import { noTillLink, openPatron, type WalletHandle } from "../lib/boot.ts";

/**
 * The wallet on its own device. The purse and the key are real; the till link
 * is the cross-device NUT frame that is not built, so every action that needs
 * a till says that in a sentence instead of pretending to work offline.
 */
export default function Wallet() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [incoming, setIncoming] = useState("");
  const [sendAmount, setSendAmount] = useState("5");
  const [sent, setSent] = useState<string | null>(null);
  const [note, setNote] = useState("This wallet has a key and an empty purse.");
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const next = openPatron("me", noTillLink());
    let live = true;
    setWallet(next);
    void next.wallet
      .balance()
      .then((held) => {
        if (live) setBalance(held);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      next.store.close();
    };
  }, []);

  async function refresh() {
    if (!wallet) return;
    setBalance(await wallet.wallet.balance());
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
          <Button label="Home" variant="ghost" onClick={() => navigate("/")} />
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

      <Card variant="muted" padding={3}>
        <Text type="supporting" textWrap="pretty">
          No till is connected on this device yet. The framed NUT envelope is
          being built in the wallet package; until it lands, receive and send
          can describe what they would do but cannot reach a mint.
        </Text>
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
    </Page>
  );
}
