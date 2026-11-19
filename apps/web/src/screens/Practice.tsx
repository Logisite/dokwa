import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import { createRoomWire, type RoomWire } from "../lib/boot.ts";
import {
  openPractice,
  runShift,
  SHIFTS,
  UNBUILT,
  type Practice,
  type ShiftResult,
} from "../lib/practice.ts";

/**
 * The test till. Same packages, separate identity and stores, no sats at
 * risk. Each shift is a real call into the packages and a signed badge from
 * the records package, or a named sentence where the mechanism does not exist.
 */
export default function PracticeScreen() {
  const navigate = useNavigate();
  const [practice, setPractice] = useState<Practice | null>(null);
  const [wire, setWire] = useState<RoomWire | null>(null);
  const [results, setResults] = useState<Record<number, ShiftResult>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const next = openPractice();
    const nextWire = createRoomWire(next.identity);
    setPractice(next);
    setWire(nextWire);
    return () => {
      nextWire.close();
      next.mintStore.close();
      next.walletStore.close();
    };
  }, []);

  async function run(n: number) {
    if (!practice || !wire) return;
    setRunning(n);
    setFailure(null);
    try {
      const result = await runShift(n, practice, wire.wire);
      setResults((all) => ({ ...all, [n]: result }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(null);
    }
  }

  return (
    <Page>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={1}>The test till</Heading>
        <Button label="Home" variant="ghost" onClick={() => navigate("/")} />
      </HStack>

      <VStack gap={1}>
        <Text type="supporting" textWrap="pretty">
          Real keys, real signing, real records, no money. This till has its own
          identity and stores under dokwa:practice. A finished shift awards a
          signed badge; the gate stays a warning the owner confirms.
        </Text>
        <Text type="supporting" wordBreak="break-all">
          {practice ? practice.identity.pubkey : "opening"}
        </Text>
      </VStack>

      {failure ? (
        <Card variant="muted" padding={3}>
          <Text type="supporting" textWrap="pretty">
            {failure}
          </Text>
        </Card>
      ) : null}

      <VStack gap={3}>
        {SHIFTS.map((shift) => {
          const result = results[shift.n];
          const absent = UNBUILT[shift.n];
          return (
            <Card key={shift.n} padding={3}>
              <VStack gap={2}>
                <HStack justify="between" align="center" gap={3}>
                  <Text weight="semibold">
                    {shift.n}. {shift.title}
                  </Text>
                  {result?.badge ? (
                    <Badge variant="success" label="badge awarded" />
                  ) : absent ? (
                    <Badge variant="warning" label="no mechanism" />
                  ) : null}
                </HStack>
                <Text type="supporting" textWrap="pretty">
                  {shift.prompt}
                </Text>
                {absent ? (
                  <Text type="supporting" textWrap="pretty">
                    {absent}
                  </Text>
                ) : (
                  <>
                    <Button
                      label={running === shift.n ? "Running" : "Run the shift"}
                      width="100%"
                      isDisabled={!practice || !wire || running !== null}
                      onClick={() => void run(shift.n)}
                    />
                    {result ? (
                      <VStack gap={1}>
                        <Text type="code" wordBreak="break-all">
                          {result.receipt}
                        </Text>
                        {result.badge ? (
                          <Text type="supporting" wordBreak="break-all">
                            badge {result.badge.slice(0, 16)}
                          </Text>
                        ) : null}
                      </VStack>
                    ) : null}
                  </>
                )}
              </VStack>
            </Card>
          );
        })}
      </VStack>
    </Page>
  );
}
