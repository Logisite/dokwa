import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import { createIdentity, deriveMintKeyset } from "@dokwa/keys";
import { loadSeed, seedHex } from "../lib/seed.ts";
import { loadVenueName, saveMode, saveVenueName } from "../lib/mode.ts";

/**
 * Till mode: the venue's identity, its keys, and the export before anything
 * of value exists. The seed is the only way to restore the device; there is
 * no account, so the screen says that plainly before it says "continue".
 */
export default function TillSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState(loadVenueName());
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function create() {
    try {
      const loaded = loadSeed("till");
      saveVenueName(name.trim() || "this place");
      saveMode("till");
      setSeed(loaded.seed);
      setCreated(loaded.created);
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function copy() {
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seedHex(seed));
      setCopied(true);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "the browser would not copy the export",
      );
    }
  }

  const identity = seed ? createIdentity(seed) : null;
  const keyset = seed ? deriveMintKeyset(seed) : null;

  return (
    <Page>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={1}>Set up the till</Heading>
        <Button label="Back" variant="ghost" onClick={() => navigate("/")} />
      </HStack>

      {!seed ? (
        <Card padding={4}>
          <VStack gap={3}>
            <Text type="supporting" textWrap="pretty">
              This device becomes the place. It creates one key that answers for
              the till, the record and the money. Nothing of value is here yet.
            </Text>
            <TextInput
              label="Venue name"
              value={name}
              onChange={setName}
              placeholder="The name on the door"
              isOptional
              width="100%"
            />
            <Button
              label="Create this till's keys"
              variant="primary"
              width="100%"
              onClick={create}
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
              <Heading level={2}>This till&apos;s key</Heading>
              <Text type="supporting" textWrap="pretty">
                {created
                  ? "New keys. Write this down before you put value in the till."
                  : "This device already has a till. The same key is shown again."}
              </Text>
              <Text type="code" wordBreak="break-all">
                {seedHex(seed)}
              </Text>
              <VStack gap={1}>
                <Text type="supporting">till key</Text>
                <Text type="code" wordBreak="break-all">
                  {identity?.pubkey}
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="supporting">keyset</Text>
                <Text type="code" wordBreak="break-all">
                  {keyset?.id}
                </Text>
              </VStack>
              <Button
                label={copied ? "Copied" : "Copy the export"}
                width="100%"
                clickAction={copy}
              />
            </VStack>
          </Card>

          <Card variant="muted" padding={4}>
            <VStack gap={2}>
              <Text weight="semibold">The export is the only recovery</Text>
              <Text type="supporting" textWrap="pretty">
                There is no account and no reset. Anyone with this string can
                answer for the till. Keep it off a screen you do not control.
              </Text>
            </VStack>
          </Card>

          <Button
            label="I have written it down"
            variant="primary"
            width="100%"
            onClick={() => navigate("/till")}
          />
          <Text type="supporting" textWrap="pretty">
            The till opens with this key. Nothing of value is in it until you
            fund the float.
          </Text>
        </VStack>
      )}
    </Page>
  );
}
