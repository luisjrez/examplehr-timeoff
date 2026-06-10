import type { ReactElement } from "react";

import { AppProviders } from "@/views/AppProviders";
import { EmployeeView } from "@/views/EmployeeView";

export default function EmployeePage(): ReactElement {
  return (
    <AppProviders>
      <EmployeeView />
    </AppProviders>
  );
}
