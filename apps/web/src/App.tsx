import { CODE_PREFIX, TILL_DB, dbName } from "@dokwa/core";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * The base shell. It exists to prove four things and nothing else:
 *
 *   1. the workspace link to `@dokwa/core` resolves through Vite
 *   2. Astryx loads its stylesheet and renders a component
 *   3. the app builds and boots on one origin
 *   4. a page can be deployed to Vercel and opened on a phone
 *
 * The room replaces this with the wallet and the till. Nothing here is a
 * fixture: every value below is read from the contract package at runtime.
 */
export default function App() {
  const facts: Array<[string, string]> = [
    ["contract", "@dokwa/core"],
    ["code prefix", CODE_PREFIX],
    ["till store", TILL_DB],
    ["wallet store", dbName({ wallet: "<id>" })],
    ["origin", location.origin],
    ["mode", location.protocol === "https:" ? "secure" : "insecure origin"],
  ];

  return (
    <main>
      <VStack
        gap={6}
        padding={5}
        maxWidth="34rem"
        style={{ margin: "0 auto", minHeight: "100dvh" }}
      >
        <VStack gap={2}>
          <Heading level={1} type="display-2">
            dokwa
          </Heading>
          <Text type="large" color="secondary" textWrap="balance">
            The base. One origin, one bundle; the wallet and the till arrive
            here.
          </Text>
        </VStack>

        <VStack gap={3}>
          {facts.map(([key, value]) => (
            <HStack key={key} gap={4} justify="between" align="start">
              <Text type="supporting">{key}</Text>
              <Text type="code" wordBreak="break-all">
                {value}
              </Text>
            </HStack>
          ))}
        </VStack>

        <Text type="supporting">
          Relays, mint and chain are not connected yet. When they are, they are
          connected for real.
        </Text>
      </VStack>
    </main>
  );
}
