import { useEffect, useRef, useState } from "react";
import { parseCode } from "@dokwa/core";
import { BarcodeDetector } from "barcode-detector/ponyfill";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";

/**
 * The camera, native reader first and zxing-wasm under it. The platform's own
 * BarcodeDetector is used when it exists; the ponyfill is the fallback and
 * the same object shape. A camera that is absent or refused is a sentence,
 * never a black rectangle.
 *
 * Multi-part codes are not built: core has no framing for them, and inventing
 * one in a screen would be a second code format. A missing part fails here
 * the only honest way, as a code that does not parse.
 */
export default function Scan() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stop() {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setScanning(false);
  }

  async function start() {
    setFailure(null);
    setFound(null);
    setStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStarting(false);
      setFailure("this browser has no camera access; paste the code instead");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      stream.current = media;
      if (!video.current) throw new Error("the camera surface did not mount");
      video.current.srcObject = media;
      await video.current.play();
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      setStarting(false);
      setScanning(true);
      timer.current = window.setInterval(() => {
        const surface = video.current;
        if (!surface) return;
        void detector
          .detect(surface)
          .then((codes) => {
            const value = codes[0]?.rawValue;
            if (!value) return;
            setFound(value);
            stop();
          })
          .catch(() => undefined);
      }, 400);
    } catch (error) {
      setStarting(false);
      stop();
      setFailure(
        error instanceof Error
          ? `the camera did not open: ${error.message}`
          : "the camera did not open",
      );
    }
  }

  function readManual() {
    setFailure(null);
    setFound(manual.trim() || null);
  }

  const parsed = found ? parseCode(found) : null;
  const cashu = found?.startsWith("cashu") ? found : null;

  return (
    <Page>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={1}>Scan a code</Heading>
        <Button label="Home" variant="ghost" onClick={() => navigate("/")} />
      </HStack>

      <Card padding={4}>
        <VStack gap={3}>
          <video
            ref={video}
            playsInline
            muted
            style={{
              width: "100%",
              borderRadius: "var(--radius-container)",
              backgroundColor: "black",
              display: scanning ? "block" : "none",
            }}
          />
          <Button
            label={
              scanning
                ? "Stop the camera"
                : starting
                  ? "Waiting for the camera"
                  : "Use the camera"
            }
            variant="primary"
            width="100%"
            size="lg"
            isDisabled={starting}
            onClick={scanning ? stop : start}
          />
          {starting && !scanning ? (
            <Text type="supporting" textWrap="pretty">
              Waiting for the camera permission. If no prompt appears, this
              browser has no camera or the permission is blocked; paste the code
              below instead.
            </Text>
          ) : null}
          {failure ? (
            <Text type="supporting" textWrap="pretty">
              {failure}
            </Text>
          ) : null}
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={3}>
          <Text weight="semibold">Or paste the code</Text>
          <TextArea
            label="Code"
            value={manual}
            onChange={setManual}
            rows={4}
            placeholder="dokwa:... or cashu..."
            width="100%"
          />
          <Button
            label="Read it"
            width="100%"
            isDisabled={manual.trim().length === 0}
            onClick={readManual}
          />
        </VStack>
      </Card>

      {found ? (
        <Card variant="muted" padding={4}>
          <VStack gap={2}>
            <Text weight="semibold">What the camera read</Text>
            {parsed ? (
              <Text type="supporting">a {parsed.kind} code</Text>
            ) : cashu ? (
              <Text type="supporting">a cashu token</Text>
            ) : (
              <Text type="supporting">
                this is not a dokwa code or a cashu token
              </Text>
            )}
            <Text type="code" wordBreak="break-all">
              {found}
            </Text>
          </VStack>
        </Card>
      ) : null}
    </Page>
  );
}
