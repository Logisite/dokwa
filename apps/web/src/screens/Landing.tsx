import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router";
import { Page } from "../components/Page.tsx";
import { loadMode, loadVenueName } from "../lib/mode.ts";

/**
 * The root route: one screen that says what this is before it asks for
 * anything. Written for the patron who scanned a code and installed nothing,
 * and for the owner who is about to make this device the till.
 */
export default function Landing() {
  const navigate = useNavigate();
  const mode = loadMode();
  const venue = loadVenueName();

  return (
    <Page>
      <VStack gap={2}>
        <Heading level={1} type="display-2">
          dokwa
        </Heading>
        <Text type="large" textWrap="pretty">
          A wallet for a place, not for a person. A bar, a hall, a stall: one
          device runs the till, other devices pay it, and the night leaves a
          signed record.
        </Text>
      </VStack>

      {mode ? (
        <Card variant="muted" padding={4}>
          <VStack gap={3}>
            <HStack justify="between" align="center" gap={3}>
              <Text weight="semibold">
                {mode === "till"
                  ? venue
                    ? `${venue} is the till`
                    : "This device is the till"
                  : "This device holds a wallet"}
              </Text>
              <Badge variant="success" label="ready" />
            </HStack>
            <Button
              label="Continue to the room"
              variant="primary"
              width="100%"
              onClick={() => navigate("/field")}
            />
            <Text type="supporting" textWrap="pretty">
              The working room is the field test while the till and wallet
              screens are built. The mode is saved; changing it later does not
              touch the keys.
            </Text>
          </VStack>
        </Card>
      ) : null}

      <VStack gap={4}>
        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2}>I run this place</Heading>
            <Text type="supporting" textWrap="pretty">
              Create the till&apos;s key, see the export before anything of
              value exists, and then open the room. One key answers for the
              night.
            </Text>
            <Button
              label={
                mode === "till"
                  ? "Open the till setup again"
                  : "Set up the till"
              }
              width="100%"
              onClick={() => navigate("/till/setup")}
            />
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2}>I am here to pay</Heading>
            <Text type="supporting" textWrap="pretty">
              Nothing to install and nothing to sign up for. A wallet opens with
              one tap and takes value by code, with or without signal.
            </Text>
            <Button
              label="Open a wallet"
              width="100%"
              onClick={() => navigate("/wallet/setup")}
            />
          </VStack>
        </Card>
      </VStack>

      <VStack gap={1}>
        <Text type="supporting" textWrap="pretty">
          You scanned a code at a bar, a market or a hall. This is the app
          behind it.
        </Text>
        <Text type="supporting" textWrap="pretty">
          No account. The key is the identity. A code is the money; a receipt is
          what was signed.
        </Text>
      </VStack>
    </Page>
  );
}
