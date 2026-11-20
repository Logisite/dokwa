import { useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import type { SignedEvent } from "@dokwa/keys";
import { BADGE_KIND, RECEIPT_KIND, SLIP_KIND } from "@dokwa/records";
import { Page } from "../components/Page.tsx";
import { hasSeed, loadSeed } from "../lib/seed.ts";
import {
  issueBadge,
  issueReceipt,
  issueSlip,
  loadStored,
  openSealed,
  ownerIdentity,
  readEvent,
  sealFor,
  type ReadSummary,
  type StoredRecord,
} from "../lib/records.ts";

type Kind = "slip" | "badge" | "receipt";
type Tab = "issue" | "read" | "stored";

function sentence(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What was signed, and by whom. The owner issues slips, badges and receipts
 * with the till's key; the screen stores the signed events and reads them
 * back with the package's own verifier. The sealed part and the carried gate
 * warning are absent, named on the board, not faked here.
 */
export default function Records() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("issue");
  const [kind, setKind] = useState<Kind>("slip");
  const [capability, setCapability] = useState("till.open");
  const [subject, setSubject] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [sealedMessage, setSealedMessage] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [lesson, setLesson] = useState("till");
  const [amount, setAmount] = useState("5");
  const [purpose, setPurpose] = useState("the night");
  const [tokenId, setTokenId] = useState("");
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<{
    event: SignedEvent;
    warning?: string;
  } | null>(null);
  const [read, setRead] = useState<ReadSummary | null>(null);
  const [stored, setStored] = useState<StoredRecord[]>(() => loadStored());
  const [warning, setWarning] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const owner = hasSeed("till");

  function ask(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      pending.current = resolve;
      setWarning(message);
    });
  }

  function answer(ok: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setWarning(null);
    resolve?.(ok);
  }

  async function issue() {
    setFailure(null);
    setResult(null);
    try {
      if (!/^[0-9a-f]{64}$/i.test(subject.trim())) {
        throw new Error("a subject is a 64 character hex public key");
      }
      if (kind === "badge") {
        const event = issueBadge({
          lesson: lesson.trim(),
          subject: subject.trim(),
        });
        setResult({ event });
      } else if (kind === "receipt") {
        const value = Number(amount);
        if (!Number.isSafeInteger(value) || value <= 0) {
          throw new Error("a receipt amount is a positive whole number");
        }
        const event = issueReceipt({
          mint: ownerIdentity().pubkey,
          amount: value,
          unit: "sat",
          tokenId: tokenId.trim() || "the code that was taken back",
          purpose: purpose.trim() || "the night",
          payer: subject.trim(),
        });
        setResult({ event });
      } else {
        const minutesValue = Number(minutes);
        if (!Number.isSafeInteger(minutesValue) || minutesValue <= 0) {
          throw new Error("an expiry is a positive number of minutes");
        }
        const made = await issueSlip(
          {
            capability: capability.trim(),
            subject: subject.trim(),
            minutes: minutesValue,
            ...(sealedMessage.trim()
              ? { sealed: sealFor(subject.trim(), sealedMessage.trim()) }
              : {}),
          },
          ask,
        );
        setResult(made);
      }
      setStored(loadStored());
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  function readPasted() {
    setFailure(null);
    setRead(null);
    setOpened(null);
    try {
      const event = JSON.parse(pasted) as SignedEvent;
      if (!event || typeof event !== "object" || typeof event.id !== "string") {
        throw new Error("that is not a signed event");
      }
      setRead(readEvent(event));
    } catch (error) {
      setFailure(sentence(error));
    }
  }

  function openTheSealed() {
    if (!read || read.kind !== "slip" || !read.ok || !read.value.sealed) return;
    setFailure(null);
    setOpened(null);
    if (!hasSeed("wallet:me")) {
      setFailure("this device has no wallet key to open the sealed part");
      return;
    }
    const plaintext = openSealed(loadSeed("wallet:me").seed, read.value.sealed);
    if (plaintext === null) {
      setFailure("the sealed part did not open with this device's key");
      return;
    }
    setOpened(plaintext);
  }

  return (
    <Page>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={1}>Records</Heading>
        <Button label="Home" variant="ghost" onClick={() => navigate("/")} />
      </HStack>

      {!owner ? (
        <Card variant="muted" padding={4}>
          <Text type="supporting" textWrap="pretty">
            This device has no till key, so it cannot issue a record. Set up the
            till first; the owner&apos;s key signs every slip and badge.
          </Text>
        </Card>
      ) : null}

      <HStack gap={2} wrap="wrap">
        {(["issue", "read", "stored"] as Tab[]).map((value) => (
          <Button
            key={value}
            label={value}
            variant={tab === value ? "primary" : "secondary"}
            onClick={() => setTab(value)}
          />
        ))}
      </HStack>

      {failure ? (
        <Card variant="muted" padding={3}>
          <Text type="supporting" textWrap="pretty">
            {failure}
          </Text>
        </Card>
      ) : null}

      {warning ? (
        <Card variant="muted" padding={3}>
          <VStack gap={3}>
            <Text weight="semibold">The badge is missing</Text>
            <Text type="supporting" textWrap="pretty">
              {warning}
            </Text>
            <HStack gap={2}>
              <Button
                label="Sign anyway"
                variant="primary"
                onClick={() => answer(true)}
              />
              <Button label="Cancel" onClick={() => answer(false)} />
            </HStack>
          </VStack>
        </Card>
      ) : null}

      {tab === "issue" ? (
        <VStack gap={4}>
          <HStack gap={2} wrap="wrap">
            {(["slip", "badge", "receipt"] as Kind[]).map((value) => (
              <Button
                key={value}
                label={value}
                variant={kind === value ? "primary" : "secondary"}
                onClick={() => setKind(value)}
              />
            ))}
          </HStack>

          <Card padding={4}>
            <VStack gap={3}>
              <TextInput
                label="Subject public key"
                value={subject}
                onChange={setSubject}
                autoCapitalize="off"
                autoComplete="off"
                hasAutoCorrect={false}
                placeholder="64 hex characters"
                width="100%"
              />
              {kind === "slip" ? (
                <>
                  <TextInput
                    label="Capability"
                    value={capability}
                    onChange={setCapability}
                    autoCapitalize="off"
                    width="100%"
                  />
                  <TextInput
                    label="Expires in minutes"
                    value={minutes}
                    onChange={setMinutes}
                    inputMode="numeric"
                    width="100%"
                  />
                  <TextArea
                    label="Sealed message"
                    value={sealedMessage}
                    onChange={setSealedMessage}
                    rows={3}
                    placeholder="Optional. Only the subject's seed opens this."
                    width="100%"
                  />
                </>
              ) : null}
              {kind === "badge" ? (
                <TextInput
                  label="Lesson"
                  value={lesson}
                  onChange={setLesson}
                  width="100%"
                />
              ) : null}
              {kind === "receipt" ? (
                <>
                  <TextInput
                    label="Amount in sat"
                    value={amount}
                    onChange={setAmount}
                    inputMode="numeric"
                    width="100%"
                  />
                  <TextInput
                    label="What it was for"
                    value={purpose}
                    onChange={setPurpose}
                    width="100%"
                  />
                  <TextInput
                    label="Token id"
                    value={tokenId}
                    onChange={setTokenId}
                    isOptional
                    autoCapitalize="off"
                    width="100%"
                  />
                </>
              ) : null}
              <Button
                label="Sign it"
                variant="primary"
                width="100%"
                size="lg"
                isDisabled={!owner || subject.trim().length === 0}
                onClick={issue}
              />
            </VStack>
          </Card>

          {result ? (
            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <Text weight="semibold">
                  {result.event.kind === RECEIPT_KIND
                    ? "receipt"
                    : result.event.kind === SLIP_KIND
                      ? "slip"
                      : result.event.kind === BADGE_KIND
                        ? "badge"
                        : "event"}{" "}
                  signed
                </Text>
                <Text type="code" wordBreak="break-all">
                  {result.event.id}
                </Text>
                {result.warning ? (
                  <Text type="supporting" textWrap="pretty">
                    Signed with a warning: {result.warning}
                  </Text>
                ) : null}
                <Text type="code" wordBreak="break-all">
                  {JSON.stringify(result.event)}
                </Text>
              </VStack>
            </Card>
          ) : null}
        </VStack>
      ) : null}

      {tab === "read" ? (
        <VStack gap={3}>
          <TextArea
            label="A signed event"
            value={pasted}
            onChange={setPasted}
            rows={6}
            placeholder='{"id":"...","kind":7102,...}'
            width="100%"
          />
          <Button
            label="Read it"
            width="100%"
            size="lg"
            isDisabled={pasted.trim().length === 0}
            onClick={readPasted}
          />
          {read ? (
            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <Text weight="semibold">
                  {read.kind}{" "}
                  {read.ok ? "reads" : `does not read: ${read.reason}`}
                </Text>
                {read.ok ? (
                  <Text type="code" wordBreak="break-all">
                    {JSON.stringify(read.value)}
                  </Text>
                ) : null}
                {read.kind === "slip" && read.ok && read.badgeMissing ? (
                  <Text type="supporting" textWrap="pretty">
                    The event itself says the badge was missing:{" "}
                    {read.badgeMissing}
                  </Text>
                ) : null}
                {read.kind === "slip" && read.ok && read.value.sealed ? (
                  <VStack gap={2}>
                    <Button
                      label="Open the sealed part"
                      width="100%"
                      onClick={openTheSealed}
                    />
                    {opened !== null ? (
                      <Text type="code" wordBreak="break-all">
                        {opened}
                      </Text>
                    ) : null}
                  </VStack>
                ) : null}
              </VStack>
            </Card>
          ) : null}
        </VStack>
      ) : null}

      {tab === "stored" ? (
        <VStack gap={3}>
          {stored.length === 0 ? (
            <Text type="supporting">
              Nothing has been signed on this origin yet.
            </Text>
          ) : (
            stored.map((record) => {
              const summary = readEvent(record.event);
              return (
                <Card key={record.event.id} padding={3}>
                  <VStack gap={1}>
                    <HStack justify="between" align="center" gap={3}>
                      <Text weight="semibold">{summary.kind}</Text>
                      <Text type="supporting">
                        {summary.ok ? "verifies" : summary.reason}
                      </Text>
                    </HStack>
                    <Text type="code" wordBreak="break-all">
                      {record.event.id}
                    </Text>
                    {summary.kind === "slip" &&
                    summary.ok &&
                    summary.badgeMissing ? (
                      <Text type="supporting" textWrap="pretty">
                        The event says the badge was missing:{" "}
                        {summary.badgeMissing}
                      </Text>
                    ) : null}
                  </VStack>
                </Card>
              );
            })
          )}
        </VStack>
      ) : null}
    </Page>
  );
}
