import type {
  LocalAgentWorkEvent,
  LocalAgentWorkEventFilter,
  LocalAgentWorkEventInput,
} from "./types.ts";
import type { AgentWorkRuntimeStore } from "./store.ts";

export type LocalAgentWorkEventSubscriber = (event: LocalAgentWorkEvent) => void | Promise<void>;

export type LocalEventHub = {
  readonly append: (input: LocalAgentWorkEventInput) => Promise<LocalAgentWorkEvent>;
  readonly replay: (filter?: LocalAgentWorkEventFilter) => Promise<readonly LocalAgentWorkEvent[]>;
  readonly subscribe: (
    filter: LocalAgentWorkEventFilter | undefined,
    subscriber: LocalAgentWorkEventSubscriber,
  ) => () => void;
};

export const makeLocalEventHub = (store: AgentWorkRuntimeStore): LocalEventHub => {
  const subscribers = new Map<
    number,
    {
      readonly filter?: LocalAgentWorkEventFilter;
      readonly subscriber: LocalAgentWorkEventSubscriber;
    }
  >();
  let nextSubscriberId = 1;

  return {
    append: async (input) => {
      const event = await store.appendEvent(input);

      for (const registration of subscribers.values()) {
        if (eventMatchesFilter(event, registration.filter)) {
          await registration.subscriber(event);
        }
      }

      return event;
    },
    replay: (filter) => store.listEvents(filter),
    subscribe: (filter, subscriber) => {
      const subscriberId = nextSubscriberId;
      nextSubscriberId += 1;
      subscribers.set(subscriberId, { filter, subscriber });

      return () => {
        subscribers.delete(subscriberId);
      };
    },
  };
};

const eventMatchesFilter = (
  event: LocalAgentWorkEvent,
  filter: LocalAgentWorkEventFilter | undefined,
): boolean =>
  (filter?.afterSequence === undefined || event.sequence > filter.afterSequence) &&
  (filter?.eventTypes === undefined || filter.eventTypes.includes(event.eventType)) &&
  (filter?.repositoryId === undefined || event.repositoryId === filter.repositoryId) &&
  (filter?.jobId === undefined || event.jobId === filter.jobId);
