import { AppLoadingScreen } from "@cycle/ui/organisms";
import type { BootstrapStatus } from "@cycle/backend/bootstrap";

type BootloaderScreenProps = {
  readonly status?: BootstrapStatus;
};

export const BootloaderScreen = ({ status }: BootloaderScreenProps) => (
  <AppLoadingScreen status={status} />
);
