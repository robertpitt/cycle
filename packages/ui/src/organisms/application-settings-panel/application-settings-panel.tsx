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

export type ApplicationSettingsSection = "general" | "profile";

export type ApplicationSettingsPanelProps = {
  readonly cacheCleared?: boolean;
  readonly cacheError?: React.ReactNode;
  readonly cacheLoading?: boolean;
  readonly densityItems: readonly SelectItem[];
  readonly densityPreference: string;
  readonly onCacheClear: () => void;
  readonly onDensityPreferenceChange: (value: string) => void;
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

export const ApplicationSettingsPanel = ({
  cacheCleared = false,
  cacheError,
  cacheLoading = false,
  densityItems,
  densityPreference,
  onCacheClear,
  onDensityPreferenceChange,
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
    general: {
      description: "Baseline application behavior and local maintenance.",
      title: "General",
    },
    profile: {
      description: "Your identity for Cycle records and repository activity.",
      title: "Profile",
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
          <>
            <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
              <Text as="h2" className="px-0 pt-5" variant="sectionTitle">
                General
              </Text>
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
                title="Clear renderer cache"
              />
              {cacheError ? (
                <FieldDescription className="pb-4 text-destructive">{cacheError}</FieldDescription>
              ) : null}
            </section>
            <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
              <Text as="h2" className="px-0 pt-5" variant="sectionTitle">
                Appearance
              </Text>
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
              <SettingRow
                control={
                  <Select
                    aria-label="Interface density"
                    className="w-40"
                    items={densityItems}
                    onValueChange={(value) => {
                      if (value !== null) onDensityPreferenceChange(value);
                    }}
                    value={densityPreference}
                  />
                }
                description="Compact is optimized for developer workflows with denser lists."
                title="Density"
              />
            </section>
          </>
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
