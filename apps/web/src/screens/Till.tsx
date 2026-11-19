import { useEffect, useState } from "react";
import { encodeCode, parseCode } from "@dokwa/core";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { CodeBox } from "../components/CodeBox.tsx";
import { Page } from "../components/Page.tsx";
import {
  createRoomWire,
  fundTill,
  openTill,
  type RoomWire,
  type TillHandle,
} from "../lib/boot.ts";
import { loadVenueName } from "../lib/mode.ts";

const AMOUNTS = [1, 2, 5, 10, 20, 50];

/**
 * The till, one action per row: open, hand out, take back, show what came in,
 * close. The float is a real wallet, the token is wallet.send, and taking one
 * back is the same wallet.receive the payer runs, against the same spent list.
 */
export default function Till() {
  const navigate = useNavigate();
  const venue = loadVenueName() || "the till";
  const [till, setTill] = useState<TillHandle | null>(null);
  const [wire, setWire] = useState<RoomWire | null>(null);
  const [online, setOnline] = useState(false);
  const [float, setFloat] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [amount, setAmount] = useState(5);
  const [token, setToken] = useState<string | null>(null);
  const [incoming, setIncoming] = useState("");
  const [note, setNote] = useState(
    "Open the till. If the float is empty it is funded from a settled quote.",
  );
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const nextTill = openTill();
    const nextWire = createRoomWire();
    let live = true;
    setTill(nextTill);
    setWire(nextWire);
    void nextTill.float
      .balance()
      .then((held) => {
        if (!live) return;
        setFloat(held);
        if (held > 0) setOpened(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      nextTill.mintStore.close();
      nextTill.floatStore.close();
      nextWire.close();
    };
  }, []);

  useEffect(() => {
    if (!wire) return;
    setOnline(wire.wire.isOnline());
    return wire.wire.onSignal(setOnline);
  }, [wire]);

  async function openTheTill() {
    if (!till) return;
    setFailure(null);
    try {
      const held = await fundTill(till, 21);
      setFloat(held);
      setOpened(true);
      setNote(`Open with ${held} sat in the float.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function handOut() {
    if (!till) return;
    setFailure(null);
    try {
      const handed = await till.float.send(amount, `a token from ${venue}`);
      setToken(handed.token);
      setFloat(await till.float.balance());
      setNote(
        `Handed out ${amount} sat. Show the code, then take the next payment.`,
      );
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function takeBack() {
    if (!till) return;
    setFailure(null);
    try {
      const trimmed = incoming.trim();
      const code = trimmed.startsWith("dokwa:") ? parseCode(trimmed) : null;
      const value = code?.kind === "token" ? code.token : trimmed;
      if (!value.startsWith("cashu")) {
        throw new Error("that is not a token or a dokwa: code");
      }
      const received = await till.float.receive(value);
      setFloat(await till.float.balance());
      setIncoming("");
      setNote(`Took back ${received} sat. The spent list has every coin.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  function closeTill() {
    till?.mintStore.close();
    till?.floatStore.close();
    wire?.close();
    setTill(null);
    setWire(null);
    setOpened(false);
    setToken(null);
    setNote(
      "The till is closed. Its keys and float are on this origin; opening again reads them.",
    );
  }

  function reopen() {
    const nextTill = openTill();
    const nextWire = createRoomWire();
    setTill(nextTill);
    setWire(nextWire);
    void nextTill.float.balance().then((held) => {
      setFloat(held);
      setOpened(held > 0);
      setNote(`Open with ${held} sat in the float.`);
    });
  }

  return (
    <Page>
      <VStack gap={3}>
        <HStack justify="between" align="center" gap={3}>
          <Heading level={1}>{venue}</Heading>
          <HStack gap={1}>
            <Button
              label="Scan"
              variant="ghost"
              onClick={() => navigate("/scan")}
            />
            <Button
              label="Records"
              variant="ghost"
              onClick={() => navigate("/records")}
            />
            <Button
              label="Home"
              variant="ghost"
              onClick={() => navigate("/")}
            />
          </HStack>
        </HStack>
        <HStack gap={2} wrap="wrap">
          <Badge
            variant={opened ? "success" : "neutral"}
            label={opened ? "open" : "closed"}
          />
          <Badge
            variant={online ? "success" : "warning"}
            label={online ? "signal" : "no signal"}
          />
          <Text type="supporting">
            {till ? `mint ${till.identity.pubkey.slice(0, 8)}...` : "closed"}
          </Text>
        </HStack>
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
          <HStack justify="between" align="center" gap={3}>
            <Text weight="semibold">Float</Text>
            <Text type="code">{float === null ? "..." : `${float} sat`}</Text>
          </HStack>
          {!opened || !till ? (
            <Button
              label={till ? "Open the till" : "Open again"}
              variant="primary"
              width="100%"
              size="lg"
              onClick={till ? openTheTill : reopen}
            />
          ) : (
            <Button label="Close the till" width="100%" onClick={closeTill} />
          )}
        </VStack>
      </Card>

      {opened && till ? (
        <>
          <Card padding={4}>
            <VStack gap={3}>
              <Heading level={2}>Hand out</Heading>
              <Grid columns={3} gap={2}>
                {AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    label={`${value}`}
                    size="lg"
                    variant={value === amount ? "primary" : "secondary"}
                    onClick={() => setAmount(value)}
                  />
                ))}
              </Grid>
              <Button
                label={`Hand out ${amount} sat`}
                variant="primary"
                width="100%"
                size="lg"
                onClick={handOut}
              />
              {token ? (
                <VStack gap={3}>
                  <Text type="supporting">
                    Hand this code to the payer. The money is in the code.
                  </Text>
                  <CodeBox
                    text={encodeCode({ kind: "token", token })}
                    label={`A ${amount} sat token from ${venue}`}
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
              <Heading level={2}>Take one back</Heading>
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
                label="Take it back"
                width="100%"
                size="lg"
                isDisabled={incoming.trim().length === 0}
                onClick={takeBack}
              />
            </VStack>
          </Card>
        </>
      ) : null}

      <Text type="supporting" textWrap="pretty">
        {note}
      </Text>
    </Page>
  );
}
