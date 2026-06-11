import { Notification, NotificationViewport, type NotificationAction } from "@cycle/ui/molecules";
import * as React from "react";
import type { ComponentTone } from "@cycle/ui/utils";

export type NotificationRequest = {
  readonly action?: NotificationAction;
  readonly description?: React.ReactNode;
  readonly durationMs?: number;
  readonly meta?: React.ReactNode;
  readonly title: React.ReactNode;
  readonly tone?: ComponentTone;
};

export type NotificationRecord = NotificationRequest & {
  readonly id: string;
};

type NotificationContextValue = {
  readonly clearNotifications: () => void;
  readonly dismissNotification: (id: string) => void;
  readonly notify: (notification: NotificationRequest) => string;
};

const notificationContext = React.createContext<NotificationContextValue | null>(null);

const defaultDurationMs = 6000;
const maxVisibleNotifications = 5;

export const NotificationProvider = ({ children }: { readonly children: React.ReactNode }) => {
  const nextId = React.useRef(1);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [notifications, setNotifications] = React.useState<readonly NotificationRecord[]>([]);

  const clearTimer = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismissNotification = React.useCallback(
    (id: string) => {
      clearTimer(id);
      setNotifications((current) => current.filter((notification) => notification.id !== id));
    },
    [clearTimer],
  );

  const notify = React.useCallback(
    (notification: NotificationRequest) => {
      const id = `notification-${nextId.current}`;
      nextId.current += 1;

      setNotifications((current) => [
        ...current.slice(Math.max(current.length - maxVisibleNotifications + 1, 0)),
        {
          ...notification,
          id,
        },
      ]);

      const durationMs = notification.durationMs ?? defaultDurationMs;
      if (durationMs > 0) {
        timers.current.set(
          id,
          setTimeout(() => {
            dismissNotification(id);
          }, durationMs),
        );
      }

      return id;
    },
    [dismissNotification],
  );

  const clearNotifications = React.useCallback(() => {
    for (const id of timers.current.keys()) {
      clearTimer(id);
    }
    setNotifications([]);
  }, [clearTimer]);

  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const value = React.useMemo(
    () => ({
      clearNotifications,
      dismissNotification,
      notify,
    }),
    [clearNotifications, dismissNotification, notify],
  );

  return (
    <notificationContext.Provider value={value}>
      {children}
      <NotificationViewport>
        {notifications.map((notification) => (
          <Notification
            action={
              notification.action
                ? {
                    label: notification.action.label,
                    onSelect: () => {
                      notification.action?.onSelect();
                      dismissNotification(notification.id);
                    },
                  }
                : undefined
            }
            description={notification.description}
            id={notification.id}
            key={notification.id}
            meta={notification.meta}
            onDismiss={() => dismissNotification(notification.id)}
            title={notification.title}
            tone={notification.tone}
          />
        ))}
      </NotificationViewport>
    </notificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = React.useContext(notificationContext);

  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider.");
  }

  return context;
};
