import { Button } from "../../atoms/button/index.ts";
import { Text } from "../../atoms/text/index.ts";

export type AppMessageScreenProps = {
  readonly actionLabel?: string;
  readonly description?: string;
  readonly onAction?: () => void;
  readonly title: string;
};

export const AppMessageScreen = ({
  actionLabel,
  description,
  onAction,
  title,
}: AppMessageScreenProps) => (
  <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
    <section className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-elevated">
      <Text as="h1" variant="sectionTitle">
        {title}
      </Text>
      {description ? (
        <Text as="p" className="mt-2" tone="muted" variant="bodyCompact">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction} variant="outline">
          {actionLabel}
        </Button>
      ) : null}
    </section>
  </main>
);
