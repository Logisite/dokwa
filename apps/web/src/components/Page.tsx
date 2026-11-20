/**
 * The phone page: one column, one content line, and a scroll that never
 * fights the notch. Every screen sits inside it so a change of gap or width
 * is one edit, not a search.
 */

import type { ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";

export function Page({ children }: { children: ReactNode }) {
  return (
    <main>
      <VStack
        gap={5}
        padding={4}
        maxWidth="30rem"
        style={{ margin: "0 auto", minHeight: "100dvh" }}
      >
        {children}
      </VStack>
    </main>
  );
}
