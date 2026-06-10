import type { Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";

import { appLedger } from "../src/data/requestLedger";
import { useNotificationsStore } from "../src/data/notifications";

import "../src/app/globals.css";

// MSW backs every story that talks to the mock HCM (TRD §9: same brain as
// the route handlers). onUnhandledRequest bypass keeps Storybook internals quiet.
initialize({ onUnhandledRequest: "bypass" });

// Chromatic snapshot stability: stories seed data and compute staleness with
// the real clock, so every build would render different timestamps and the
// snapshots flap. Under Chromatic's capture browser (UA marker) we freeze
// Date at a fixed instant — local Storybook and CI interaction tests keep
// the real clock.
const FROZEN_NOW = new Date("2026-06-10T12:00:00Z").valueOf();

function freezeClockForChromatic(): void {
  if (
    typeof window === "undefined" ||
    !/Chromatic/.test(window.navigator.userAgent)
  ) {
    return;
  }
  const RealDate = Date;
  class FrozenDate extends RealDate {
    // Our code only ever uses `new Date()` and `new Date(value)`.
    constructor(value?: number | string | Date) {
      super(value ?? FROZEN_NOW);
    }
    static override now(): number {
      return FROZEN_NOW;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
}

freezeClockForChromatic();

const preview: Preview = {
  loaders: [
    mswLoader,
    // Session stores are app singletons; stories must not leak into each other.
    (): Promise<Record<string, never>> => {
      appLedger.getState().clear();
      useNotificationsStore.getState().clear();
      return Promise.resolve({});
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
