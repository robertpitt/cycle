import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangle, FolderPlus } from "lucide-react";
import { Button } from "../../atoms/button/index.ts";
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
} from "./index.ts";

const meta = {
  component: DialogRoot,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Molecules/Dialog",
} satisfies Meta<typeof DialogRoot>;

export default meta;

type Story = StoryObj<typeof meta>;

const StandardDialog = ({ width = "md" }: { readonly width?: "lg" | "md" | "sm" | "xl" }) => (
  <DialogRoot defaultOpen>
    <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPanel width={width}>
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle>Import repository</DialogTitle>
              <DialogDescription>
                Choose how Cycle should prepare this local project before workspace data is added.
              </DialogDescription>
            </div>
            <DialogCloseButton />
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-subtle/45 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <FolderPlus aria-hidden className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Connect project folder</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Cycle can read local metadata and create a repository-backed issue store.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
                  <AlertTriangle aria-hidden className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warning">Repository required</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Initialise Git before importing if the selected folder has no repository.
                  </p>
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost">Cancel</Button>
            <Button>Continue</Button>
          </DialogFooter>
        </DialogPanel>
      </DialogViewport>
    </DialogPortal>
  </DialogRoot>
);

export const Default: Story = {
  render: () => (
    <div className="grid min-h-[520px] place-items-center rounded-lg border border-border bg-background">
      <StandardDialog />
    </div>
  ),
};

export const WidePanel: Story = {
  render: () => (
    <div className="grid min-h-[560px] place-items-center rounded-lg border border-border bg-background">
      <StandardDialog width="xl" />
    </div>
  ),
};
