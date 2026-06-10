import type { Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";

import { appLedger } from "../src/data/requestLedger";
import { useNotificationsStore } from "../src/data/notifications";

import "../src/app/globals.css";

// MSW backs every story that talks to the mock HCM (TRD §9: same brain as
// the route handlers). onUnhandledRequest bypass keeps Storybook internals quiet.
initialize({ onUnhandledRequest: "bypass" });

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
