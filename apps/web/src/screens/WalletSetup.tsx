import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import { noTillLink, openPatron, type WalletHandle } from "../lib/boot.ts";
import { saveMode } from "../lib/mode.ts";

/**
 * Wallet mode: no account, no name, one key and an empty purse. The till is
 * not connected on this device because the cross-device NUT frame does not
 * exist yet; the screen says that in a sentence rather than showing a spinner.
 */
export default function WalletSetup() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    return () => wallet?.store.close();
  }, [wallet]);

  async function open() {
    try {
      const next = openPatron("me", noTillLink());
      saveMode("wallet");
      setWallet(next);
      setBalance(await next.wallet.balance());
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Page>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={1}>Open a wallet</Heading>
        <Button label="Back" variant="ghost" onClick={() => navigate("/")} />
      </HStack>

      {!wallet ? (
        <Card padding={4}>
          <VStack gap={3}>
            <Text type="supporting" textWrap="pretty">
              No account, no email, nothing to remember. This device makes one
              key and an empty purse. It takes value by code.
            </Text>
            <Button
              label="Make this wallet"
              variant="primary"
              width="100%"
              onClick={open}
            />
            {failure ? (
              <Text type="supporting" color="accent">
                {failure}
              </Text>
            ) : null}
          </VStack>
        </Card>
      ) : (
        <VStack gap={4}>
          <Card padding={4}>
            <VStack gap={3}>
              <Heading level={2}>Your wallet</Heading>
              <VStack gap={1}>
                <Text type="supporting">wallet key</Text>
                <Text type="code" wordBreak="break-all">
                  {wallet.identity.pubkey}
                </Text>
              </VStack>
              <HStack justify="between" align="center" gap={3}>
                <Text>Holds</Text>
                <Text type="code">
                  {balance === null ? "..." : `${balance} sat`}
                </Text>
              </HStack>
            </VStack>
          </Card>

          <Card variant="muted" padding={4}>
            <VStack gap={2}>
              <Text weight="semibold">No till is connected yet</Text>
              <Text type="supporting" textWrap="pretty">
                The purse and the key are real. The link that asks a till for
                value is the next piece of the room, so this wallet cannot take
                a token on its own yet.
              </Text>
            </VStack>
          </Card>

          <Button
            label="Continue to the room"
            variant="primary"
            width="100%"
            onClick={() => navigate("/field")}
          />
          <Text type="supporting" textWrap="pretty">
            The working room is the field test while the wallet screen is built.
            It runs a separate purse against a till in the same page.
          </Text>
        </VStack>
      )}
    </Page>
  );
}
