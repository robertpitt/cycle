import { Context, Effect, Layer } from "effect";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "../../DatabaseIdGenerator.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  CURRENT_SCHEMA_VERSION,
  stripUndefined,
  type Actor,
  type CycleRepositoryMetadata,
  type IssueFrontmatter,
  type TicketDocument,
  type UserProfileDocument,
} from "../../domain/index.ts";
import { DEFAULT_TICKET_PREFIX, TICKET_ID_PATTERN } from "./TicketCommandRules.ts";
import { defaultRepositoryMetadata } from "./RepositoryDefaults.ts";
import {
  makeCycleRepositoryMetadata,
  normalizeTicketSeedEffect,
  normalizeUserIdEffect,
} from "./CatalogDocuments.ts";
import { nextEventId } from "../DatabaseBoundary.ts";
import type {
  DatabaseEventPayload,
  DatabaseWritePlan,
  RepositoryRuntime,
} from "../DatabaseRuntime.ts";
import {
  DatabaseProjectionService,
  type DatabaseProjection,
} from "../projection/DatabaseProjection.ts";

export type CommandWriterShape = ReturnType<typeof makeCommandWriter>;

export class CommandWriter extends Context.Service<CommandWriter, CommandWriterShape>()(
  "@cycle/database/internals/commands/CommandWriter",
) {}

export const makeCommandWriter = (
  ids: DatabaseIdGeneratorShape,
  projection: DatabaseProjection,
) => {
  const appendEvent = Effect.fn("CommandWriter.appendEvent")(function* (
    plan: DatabaseWritePlan,
    aggregateType: string,
    aggregateId: string,
    payload: DatabaseEventPayload,
  ) {
    const eventId = yield* nextEventId(ids);
    return {
      ...plan,
      events: [
        ...plan.events,
        {
          aggregateId,
          aggregateType,
          eventId,
          payload: stripUndefined(payload) as DatabaseEventPayload,
        },
      ],
    } satisfies DatabaseWritePlan;
  });

  const appendTicketUpdateEvents = Effect.fn("CommandWriter.appendTicketUpdateEvents")(function* (
    initialPlan: DatabaseWritePlan,
    current: TicketDocument,
    next: TicketDocument,
  ) {
    let plan = initialPlan;
    if (current.body !== next.body) {
      plan = yield* appendEvent(plan, "ticket", next.id, {
        field: "body",
        op: "ticket.update",
        value: next.body,
      });
    }

    const fields = new Set([
      ...Object.keys(current.frontmatter),
      ...Object.keys(next.frontmatter),
    ] as Array<keyof IssueFrontmatter>);
    for (const field of [...fields].sort()) {
      const before = current.frontmatter[field];
      const after = next.frontmatter[field];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      plan = yield* appendEvent(plan, "ticket", next.id, {
        field,
        op: "ticket.update",
        value: after ?? null,
      });
    }
    return plan;
  });

  const ensureActorUserProfile = Effect.fn("CommandWriter.ensureActorUserProfile")(function* (
    repository: RepositoryRuntime,
    plan: DatabaseWritePlan,
    actor: Actor,
    now: string,
  ) {
    if (actor.type !== "human") return plan;
    if (actor.email === undefined || actor.email.trim().length === 0) {
      return yield* new DatabaseValidationError({
        field: "user.email",
        message: "human repository writes require an email address",
      });
    }

    const userId = yield* normalizeUserIdEffect(actor.email);
    const existing = yield* projection.getUser(repository.repositoryId, userId);
    if (existing !== null && existing.displayName === actor.name) return plan;
    if (existing !== null && existing.updatedAt > now) return plan;

    const next: UserProfileDocument = {
      aliases: existing?.aliases,
      avatarUrl: existing?.avatarUrl,
      createdAt: existing?.createdAt ?? now,
      disabledAt: existing?.disabledAt,
      displayName: actor.name,
      email: userId,
      id: userId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      source: existing?.source ?? "local-profile",
      timezone: existing?.timezone,
      updatedAt: now,
    };
    return yield* appendEvent(plan, "user", userId, {
      op: "user.upsert",
      value: stripUndefined(next) as UserProfileDocument,
    });
  });

  const ensureDefaultWorkflowMetadata = Effect.fn("CommandWriter.ensureDefaultWorkflowMetadata")(
    function* (
      repository: RepositoryRuntime,
      initialPlan: DatabaseWritePlan,
      actor: Actor,
      now: string,
    ): Effect.fn.Return<
      {
        readonly changed: boolean;
        readonly metadata: CycleRepositoryMetadata;
        readonly plan: DatabaseWritePlan;
      },
      DatabaseFailure
    > {
      let plan = initialPlan;
      const metadata =
        repository.cycleMetadata ?? makeCycleRepositoryMetadata(DEFAULT_TICKET_PREFIX, now);
      const actorUserId =
        actor.type === "human" && actor.email !== undefined && actor.email.trim().length > 0
          ? yield* normalizeUserIdEffect(actor.email)
          : undefined;
      const defaults = defaultRepositoryMetadata(actor, now, actorUserId);
      let changed = repository.cycleMetadata === undefined;

      if (repository.cycleMetadata === undefined) {
        plan = yield* appendEvent(plan, "repository", "_", {
          op: "repository.metadata.set",
          value: metadata,
        });
      }
      const labels = yield* projection.listLabels(repository.repositoryId);
      for (const label of defaults.labels) {
        if (labels.entries.some((entry) => entry.id === label.id)) continue;
        plan = yield* appendEvent(plan, "label", label.id, {
          op: "label.upsert",
          value: label,
        });
        changed = true;
      }
      for (const view of defaults.views) {
        if ((yield* projection.getView(repository.repositoryId, view.id)) !== null) continue;
        plan = yield* appendEvent(plan, "view", view.id, { op: "view.upsert", value: view });
        changed = true;
      }
      for (const template of defaults.templates) {
        if ((yield* projection.getTemplate(repository.repositoryId, template.id)) !== null)
          continue;
        plan = yield* appendEvent(plan, "template", template.id, {
          op: "template.upsert",
          value: template,
        });
        changed = true;
      }
      return { changed, metadata, plan };
    },
  );

  const beginWritePlan = Effect.fn("CommandWriter.beginWritePlan")(function* (
    repository: RepositoryRuntime,
    label: string,
    actor: Actor,
    now: string,
  ) {
    const initial: DatabaseWritePlan = { actor, events: [], label };
    return (yield* ensureDefaultWorkflowMetadata(repository, initial, actor, now)).plan;
  });

  const generateTicketId = Effect.fn("CommandWriter.generateTicketId")(function* (
    repository: RepositoryRuntime,
  ) {
    const prefix = repository.cycleMetadata?.ticketPrefix ?? DEFAULT_TICKET_PREFIX;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const seed = yield* normalizeTicketSeedEffect(yield* ids.ticketId);
      for (let length = 5; length <= seed.length; length += 1) {
        const candidate = `${prefix}-${seed.slice(0, length)}`;
        if (!TICKET_ID_PATTERN.test(candidate)) continue;
        if ((yield* projection.getTicket(repository.repositoryId, candidate)) !== null) continue;
        return candidate;
      }
    }
    return yield* new DatabaseValidationError({
      field: "ticket.id",
      message: "unable to generate a unique ticket id",
    });
  });

  return {
    appendEvent,
    appendTicketUpdateEvents,
    beginWritePlan,
    ensureActorUserProfile,
    generateTicketId,
  };
};

export const CommandWriterLive = Layer.effect(
  CommandWriter,
  Effect.gen(function* () {
    const ids = yield* DatabaseIdGenerator;
    const projection = yield* DatabaseProjectionService;
    return CommandWriter.of(makeCommandWriter(ids, projection));
  }),
);
