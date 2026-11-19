/**
 * A code drawn from the real matrix, pure black on white inside its own box.
 *
 * The theme must never reach inside this box: a code has to scan in a dim
 * room and in daylight, so the quiet zone and the module colours are fixed
 * here rather than inherited. Everything outside the box is the theme's.
 */

import { useMemo } from "react";
import { qrModules } from "@dokwa/core";
import { VStack } from "@astryxdesign/core/VStack";

export interface CodeBoxProps {
  /** the exact text a camera should read */
  text: string;
  /** what the code is, for anyone who cannot see it */
  label: string;
}

export function CodeBox({ text, label }: CodeBoxProps) {
  const modules = useMemo(
    () => qrModules(text, { ecc: "M", border: 4 }),
    [text],
  );
  const size = modules.length;

  return (
    <VStack
      gap={0}
      padding={3}
      align="center"
      style={{
        backgroundColor: "white",
        borderRadius: "var(--radius-container)",
      }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <rect x={0} y={0} width={size} height={size} fill="white" />
        {modules.map((row, y) =>
          row.map((dark, x) =>
            dark ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="black"
              />
            ) : null,
          ),
        )}
      </svg>
    </VStack>
  );
}
