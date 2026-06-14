import { AddRepositoryPanel } from "@cycle/ui/organisms";
import type * as React from "react";

type AddRepositoryStepProps = {
  readonly error?: React.ReactNode;
  readonly onSubmit: () => void;
  readonly saving?: boolean;
};

export const AddRepositoryStep = (props: AddRepositoryStepProps) => (
  <AddRepositoryPanel {...props} />
);
