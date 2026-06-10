import type { ReactElement } from "react";

import { AppProviders } from "@/views/AppProviders";
import { ManagerView } from "@/views/ManagerView";

export default function ManagerPage(): ReactElement {
  return (
    <AppProviders>
      <ManagerView />
    </AppProviders>
  );
}
