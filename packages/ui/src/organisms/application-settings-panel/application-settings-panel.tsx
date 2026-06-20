import { Check, RotateCcw, Save } from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { Select, type SelectItem } from "../../atoms/select/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { Field, FieldDescription, FieldLabel } from "../../molecules/field/index.ts";
import { SettingRow } from "../../molecules/setting-row/index.ts";

export type ApplicationSettingsProfile = {
  readonly displayName: string;
  readonly email: string;
};

export type ApplicationSettingsSection =
  | "appearance"
  | "configuration"
  | "connectors"
  | "general"
  | "keyboard-shortcuts"
  | "mcp-servers"
  | "personalisation"
  | "profile"
  | "skills";

export type ApplicationSettingsPanelProps = {
  readonly cacheCleared?: boolean;
  readonly cacheError?: React.ReactNode;
  readonly cacheLoading?: boolean;
  readonly onCacheClear: () => void;
  readonly onProfileSave: (profile: ApplicationSettingsProfile) => void;
  readonly onThemePreferenceChange: (value: string) => void;
  readonly profile: ApplicationSettingsProfile;
  readonly profileError?: React.ReactNode;
  readonly profileLoading?: boolean;
  readonly section: ApplicationSettingsSection;
  readonly themeItems: readonly SelectItem[];
  readonly themePreference: string;
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim());

const isValidProfile = (displayName: string, email: string): boolean =>
  displayName.trim().length > 1 && isValidEmail(email);

const PlaceholderSection = ({ description }: { readonly description: string }) => (
  <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
    <Text as="h2" variant="sectionTitle">
      No options yet
    </Text>
    <Text as="p" className="mt-1" tone="muted" variant="bodyCompact">
      {description}
    </Text>
  </section>
);

export const ApplicationSettingsPanel = ({
  cacheCleared = false,
  cacheError,
  cacheLoading = false,
  onCacheClear,
  onProfileSave,
  onThemePreferenceChange,
  profile,
  profileError,
  profileLoading = false,
  section,
  themeItems,
  themePreference,
}: ApplicationSettingsPanelProps) => {
  const [displayName, setDisplayName] = React.useState(profile.displayName);
  const [email, setEmail] = React.useState(profile.email);

  React.useEffect(() => {
    setDisplayName(profile.displayName);
    setEmail(profile.email);
  }, [profile.displayName, profile.email]);

  const profileChanged = displayName !== profile.displayName || email !== profile.email;
  const profileValid = isValidProfile(displayName, email);

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileChanged || !profileValid) return;
    onProfileSave({ displayName, email });
  };

  const sectionCopy = {
    appearance: {
      description: "Choose how Cycle follows native light, dark, or system appearance.",
      title: "Appearance",
    },
    configuration: {
      description: "Application-level configuration for the local desktop workspace.",
      title: "Configuration",
    },
    connectors: {
      description: "External connector settings for linked services.",
      title: "Connectors",
    },
    general: {
      description: "Baseline application behavior and local maintenance.",
      title: "General",
    },
    "keyboard-shortcuts": {
      description: "Keyboard command preferences for faster navigation.",
      title: "Keyboard Shortcuts",
    },
    "mcp-servers": {
      description: "MCP server configuration for local and remote tool providers.",
      title: "MCP Servers",
    },
    personalisation: {
      description: "Personal defaults for how Cycle adapts to your workflow.",
      title: "Personalisation",
    },
    profile: {
      description: "Your identity for Cycle records and repository activity.",
      title: "Profile",
    },
    skills: {
      description: "Skill settings for extending Cycle with focused workflows.",
      title: "Skills",
    },
  } satisfies Record<
    ApplicationSettingsSection,
    { readonly description: string; readonly title: string }
  >;

  const currentSection = sectionCopy[section];
  const renderSection = () => {
    switch (section) {
      case "general":
        return (
          <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
            <h2 className="sr-only">General</h2>
            <SettingRow
              control={
                <Button
                  leftIcon={
                    cacheCleared ? (
                      <Check aria-hidden className="size-4" />
                    ) : (
                      <RotateCcw aria-hidden className="size-4" />
                    )
                  }
                  loading={cacheLoading}
                  loadingLabel="Clearing cache"
                  onClick={onCacheClear}
                  size="sm"
                  variant="outline"
                >
                  {cacheCleared ? "Cleared" : "Clear"}
                </Button>
              }
              description="Clears Electron renderer cache without touching repositories or local data."
              title="Cache"
            />
            {cacheError ? (
              <FieldDescription className="pb-4 text-destructive">{cacheError}</FieldDescription>
            ) : null}
          </section>
        );
      case "profile":
        return (
          <form
            className="rounded-lg border border-border bg-surface p-5 shadow-card"
            onSubmit={saveProfile}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <Text as="h2" variant="sectionTitle">
                  Identity
                </Text>
                <Text className="mt-1" tone="muted" variant="bodyCompact">
                  Used for Cycle records and Git commit identity when repository config is
                  unavailable.
                </Text>
              </div>
              <Button
                disabled={!profileChanged || !profileValid}
                leftIcon={<Save aria-hidden className="size-4" />}
                loading={profileLoading}
                loadingLabel="Saving profile"
                size="sm"
                type="submit"
                variant="outline"
              >
                Save
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field required invalid={displayName.trim().length <= 1}>
                <FieldLabel>Display name</FieldLabel>
                <Input
                  aria-label="Display name"
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                  value={displayName}
                />
              </Field>
              <Field required invalid={email.trim().length === 0 || !isValidEmail(email)}>
                <FieldLabel>Email</FieldLabel>
                <Input
                  aria-label="Email"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  type="email"
                  value={email}
                />
              </Field>
            </div>
            {profileError ? (
              <Text as="p" className="mt-3" tone="danger" variant="bodyCompact">
                {profileError}
              </Text>
            ) : null}
          </form>
        );
      case "appearance":
        return (
          <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
            <h2 className="sr-only">Appearance</h2>
            <SettingRow
              control={
                <Select
                  aria-label="Interface theme"
                  className="w-40"
                  items={themeItems}
                  onValueChange={(value) => {
                    if (value !== null) onThemePreferenceChange(value);
                  }}
                  value={themePreference}
                />
              }
              description="Uses Electron native light, dark, or system appearance."
              title="Interface theme"
            />
          </section>
        );
      case "configuration":
        return <PlaceholderSection description="No configuration options are available yet." />;
      case "personalisation":
        return <PlaceholderSection description="No personalisation options are available yet." />;
      case "keyboard-shortcuts":
        return <PlaceholderSection description="No keyboard shortcut options are available yet." />;
      case "connectors":
        return <PlaceholderSection description="No connector options are available yet." />;
      case "mcp-servers":
        return <PlaceholderSection description="No MCP server options are available yet." />;
      case "skills":
        return <PlaceholderSection description="No skill options are available yet." />;
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <Text as="h1" variant="pageTitle">
          {currentSection.title}
        </Text>
        <Text tone="muted" variant="bodyCompact">
          {currentSection.description}
        </Text>
      </header>

      {renderSection()}
    </div>
  );
};
