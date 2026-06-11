import { Button, Input, Select } from "@cycle/ui/atoms";
import { Field, FieldDescription, FieldLabel, SettingRow } from "@cycle/ui/molecules";
import { Check, RotateCcw, Save } from "lucide-react";
import * as React from "react";
import {
  isThemePreference,
  type AppConfigState,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import {
  useClearCacheMutation,
  useSetThemePreferenceMutation,
  useUpdateProfileMutation,
} from "../mutations/index.ts";

type ApplicationSettingsPanelProps = {
  readonly appConfig: AppConfigState;
};

const themeItems = [
  {
    label: "System",
    value: "system",
  },
  {
    label: "Light",
    value: "light",
  },
  {
    label: "Dark",
    value: "dark",
  },
] satisfies ReadonlyArray<{ readonly label: string; readonly value: ThemePreference }>;

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim());

const isValidProfile = (displayName: string, email: string): boolean =>
  displayName.trim().length > 1 && isValidEmail(email);

export const ApplicationSettingsPanel = ({ appConfig }: ApplicationSettingsPanelProps) => {
  const [displayName, setDisplayName] = React.useState(appConfig.profile.displayName);
  const [email, setEmail] = React.useState(appConfig.profile.email);
  const [cacheCleared, setCacheCleared] = React.useState(false);
  const updateProfile = useUpdateProfileMutation({ appConfig });
  const setThemePreference = useSetThemePreferenceMutation({ appConfig });
  const clearCache = useClearCacheMutation();

  React.useEffect(() => {
    setDisplayName(appConfig.profile.displayName);
    setEmail(appConfig.profile.email);
  }, [appConfig.profile.displayName, appConfig.profile.email]);

  const profileChanged =
    displayName !== appConfig.profile.displayName || email !== appConfig.profile.email;
  const profileValid = isValidProfile(displayName, email);

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileChanged || !profileValid) return;

    updateProfile.mutate({
      displayName,
      email,
    });
  };

  const changeTheme = (value: string | null) => {
    if (!isThemePreference(value) || value === appConfig.theme.preference) return;
    setThemePreference.mutate(value);
  };

  const clearRendererCache = () => {
    setCacheCleared(false);
    clearCache.mutate(undefined, {
      onSuccess: () => setCacheCleared(true),
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">Application settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure identity, native appearance, and local desktop maintenance.
        </p>
      </header>

      <form
        className="rounded-lg border border-border bg-surface p-5 shadow-card"
        onSubmit={saveProfile}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Identity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Used for Cycle records and Git commit identity when repository config is unavailable.
            </p>
          </div>
          <Button
            disabled={!profileChanged || !profileValid}
            leftIcon={<Save aria-hidden className="size-4" />}
            loading={updateProfile.isPending}
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
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </Field>
          <Field required invalid={email.trim().length === 0 || !isValidEmail(email)}>
            <FieldLabel>Email</FieldLabel>
            <Input
              aria-label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field>
        </div>
        {updateProfile.error ? (
          <p className="mt-3 text-sm text-destructive">
            {updateProfile.error instanceof Error
              ? updateProfile.error.message
              : "Unable to save profile."}
          </p>
        ) : null}
      </form>

      <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
        <h2 className="sr-only">Preferences</h2>
        <SettingRow
          control={
            <Select
              aria-label="Interface theme"
              className="w-40"
              items={themeItems}
              value={appConfig.theme.preference}
              onValueChange={changeTheme}
            />
          }
          description="Uses Electron native light, dark, or system appearance."
          title="Interface theme"
        />
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
              loading={clearCache.isPending}
              loadingLabel="Clearing cache"
              onClick={clearRendererCache}
              size="sm"
              variant="outline"
            >
              {cacheCleared ? "Cleared" : "Clear"}
            </Button>
          }
          description="Clears Electron renderer cache without touching repositories or local data."
          title="Cache"
        />
        {clearCache.error ? (
          <FieldDescription className="pb-4 text-destructive">
            {clearCache.error instanceof Error
              ? clearCache.error.message
              : "Unable to clear cache."}
          </FieldDescription>
        ) : null}
      </section>
    </div>
  );
};
