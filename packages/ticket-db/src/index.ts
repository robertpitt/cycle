export { CURRENT_SCHEMA_VERSION } from "./constants.ts";
export {
  DEFAULT_PROTECTED_SECTIONS,
  defaultIssueBody,
  extractSection,
  hasSectionContent,
  protectedSectionsChanged,
} from "./domain/IssueBody.ts";
export {
  actorKey,
  hydrateDraftSession,
  hydrateIssueDocument,
  hydrateLinkedRecord,
  makeIssueDocument,
  makeIssueFrontmatter,
  normalizeKey,
  updateIssueDocument,
  updatedDateKey,
} from "./domain/IssueDocument.ts";
export type {
  AddLinkedRecordInput,
  CommitDraftResult,
  CreateDraftInput,
  CreateDraftResult,
  CreateIssueInput,
  HistoryOptions,
  IssueHistory,
  IssueHistoryEntry,
  IssuePage,
  IssueQuery,
  LinkedRecordList,
  ReadOptions,
  RecordQuery,
  TransitionIssueInput,
  UpdateDraftInput,
  UpdateIssueInput,
} from "./domain/Types.ts";
export {
  DraftNotCommittableError,
  draftNotCommittable,
} from "./errors/DraftNotCommittableError.ts";
export { DraftNotFoundError, draftNotFound } from "./errors/DraftNotFoundError.ts";
export { IssueNotFoundError, issueNotFound } from "./errors/IssueNotFoundError.ts";
export { PlanImmutabilityError, planImmutabilityError } from "./errors/PlanImmutabilityError.ts";
export { StorageConflictError, storageConflict } from "./errors/StorageConflictError.ts";
export { StorageError, storageError } from "./errors/StorageError.ts";
export type { TicketDbFailure } from "./errors/TicketDbFailure.ts";
export { ValidationError, validationError } from "./errors/ValidationError.ts";
export { WorkflowError, workflowError } from "./errors/WorkflowError.ts";
export { mapGitDbError } from "./errors/mapGitDbError.ts";
export * from "./schemas/Actor.ts";
export * from "./schemas/ActorType.ts";
export * from "./schemas/AgentProvenance.ts";
export * from "./schemas/DraftId.ts";
export * from "./schemas/DraftSession.ts";
export * from "./schemas/DraftStatus.ts";
export * from "./schemas/ExecutionId.ts";
export * from "./schemas/ExecutionRecordPayload.ts";
export * from "./schemas/ExecutionStatus.ts";
export * from "./schemas/ExternalLink.ts";
export * from "./schemas/IssueDocument.ts";
export * from "./schemas/IssueFrontmatter.ts";
export * from "./schemas/IssueId.ts";
export * from "./schemas/IssuePriority.ts";
export * from "./schemas/IssueStatus.ts";
export * from "./schemas/IssueType.ts";
export * from "./schemas/LinkedRecord.ts";
export * from "./schemas/RecordId.ts";
export * from "./schemas/RecordType.ts";
export {
  TicketDbInMemory,
  TicketDbLive,
  TicketDbService,
  TicketDbTest,
  type TicketDbServiceShape,
} from "./services/TicketDbService.ts";
export {
  TicketIdentity,
  TicketIdentityTest,
  type TicketIdentityShape,
} from "./services/TicketIdentity.ts";
export {
  TicketIdGenerator,
  TicketIdGeneratorDeterministic,
  TicketIdGeneratorLive,
  makeDeterministicIdGenerator,
  type TicketIdGeneratorShape,
} from "./services/TicketIdGenerator.ts";
export {
  WorkflowPolicy,
  WorkflowPolicyDefault,
  makeDefaultWorkflowPolicy,
  type WorkflowPolicyShape,
} from "./services/WorkflowPolicy.ts";
