import type { CycleUseCase, UseCaseInput, UseCaseMeta, UseCaseName } from "./Types.ts";

export const makeUseCase = <Name extends UseCaseName>(
  name: Name,
  input: UseCaseInput<Name>,
  meta?: UseCaseMeta,
): CycleUseCase<Name> => ({
  input,
  ...(meta === undefined ? {} : { meta }),
  name,
});

const constructor =
  <Name extends UseCaseName>(name: Name) =>
  (input: UseCaseInput<Name>, meta?: UseCaseMeta): CycleUseCase<Name> =>
    makeUseCase(name, input, meta);

export const RepositoryOpen = constructor("RepositoryOpen");
export const RepositoryClose = constructor("RepositoryClose");
export const RepositoryList = constructor("RepositoryList");
export const RepositoryStatusGet = constructor("RepositoryStatusGet");
export const RepositoryMaterializationWarningsList = constructor(
  "RepositoryMaterializationWarningsList",
);
export const RepositorySync = constructor("RepositorySync");
export const RepositoryPush = constructor("RepositoryPush");
export const RepositoryHistoryList = constructor("RepositoryHistoryList");
export const IssueCreate = constructor("IssueCreate");
export const IssueGet = constructor("IssueGet");
export const IssueList = constructor("IssueList");
export const IssueSearch = constructor("IssueSearch");
export const IssueUpdate = constructor("IssueUpdate");
export const IssueTransition = constructor("IssueTransition");
export const IssueArchive = constructor("IssueArchive");
export const IssueRestore = constructor("IssueRestore");
export const IssueDelete = constructor("IssueDelete");
export const IssueHistoryList = constructor("IssueHistoryList");
export const IssueRevisionGet = constructor("IssueRevisionGet");
export const IssueDiff = constructor("IssueDiff");
export const IssueRelationAdd = constructor("IssueRelationAdd");
export const IssueRelationRemove = constructor("IssueRelationRemove");
export const DraftCreate = constructor("DraftCreate");
export const DraftUpdate = constructor("DraftUpdate");
export const DraftCommit = constructor("DraftCommit");
export const CommentAdd = constructor("CommentAdd");
export const RecordAdd = constructor("RecordAdd");
export const RecordListForIssue = constructor("RecordListForIssue");
export const InitiativeCreate = constructor("InitiativeCreate");
export const InitiativeProgressGet = constructor("InitiativeProgressGet");
export const InitiativeUpdateAdd = constructor("InitiativeUpdateAdd");
export const LabelList = constructor("LabelList");
export const LabelUpsert = constructor("LabelUpsert");
export const LabelArchive = constructor("LabelArchive");
export const UserGet = constructor("UserGet");
export const UserList = constructor("UserList");
export const UserUpsert = constructor("UserUpsert");
export const ViewCreate = constructor("ViewCreate");
export const ViewGet = constructor("ViewGet");
export const ViewList = constructor("ViewList");
export const ViewUpdate = constructor("ViewUpdate");
export const ViewDelete = constructor("ViewDelete");
export const TemplateCreate = constructor("TemplateCreate");
export const TemplateGet = constructor("TemplateGet");
export const TemplateList = constructor("TemplateList");
export const TemplateUpdate = constructor("TemplateUpdate");
export const TemplateArchive = constructor("TemplateArchive");
export const AutomationEvaluateRepository = constructor("AutomationEvaluateRepository");
export const AutomationEvaluateIssues = constructor("AutomationEvaluateIssues");
export const AutomationEvaluateQuery = constructor("AutomationEvaluateQuery");
