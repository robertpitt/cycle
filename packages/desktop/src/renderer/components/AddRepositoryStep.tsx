import { Button } from "@cycle/ui/atoms";
import { FolderPlus, LoaderCircle } from "lucide-react";
import type * as React from "react";

type AddRepositoryStepProps = {
  readonly error?: React.ReactNode;
  readonly onSubmit: () => void;
  readonly saving?: boolean;
};

export const AddRepositoryStep = ({ error, onSubmit, saving = false }: AddRepositoryStepProps) => (
  <div className="grid h-full place-items-center">
    <section className="grid w-full max-w-[440px] justify-items-center gap-5 text-center">
      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
        <FolderPlus aria-hidden className="size-5" />
      </div>
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold tracking-normal">Add Repository</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Connect a local repository so Cycle can read project context and start tracking tickets.
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-5 text-warning">
          {error}
        </div>
      ) : null}
      <Button
        disabled={saving}
        leftIcon={
          saving ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : (
            <FolderPlus aria-hidden className="size-4" />
          )
        }
        onClick={onSubmit}
      >
        Choose Folder
      </Button>
    </section>
  </div>
);
