import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi } from "../CycleHttpApi.ts";
import { withAutomationHandlers } from "./v1/automation.ts";
import { withCommentHandlers } from "./v1/comments.ts";
import { withDraftHandlers } from "./v1/drafts.ts";
import { withInitiativeHandlers } from "./v1/initiatives.ts";
import { withIssueHandlers } from "./v1/issues.ts";
import { withLabelHandlers } from "./v1/labels.ts";
import { withRepositoryHandlers } from "./v1/repositories.ts";
import { withTemplateHandlers } from "./v1/templates.ts";
import { withUserHandlers } from "./v1/users.ts";
import { withViewHandlers } from "./v1/views.ts";

export const V1ApiHandlers = HttpApiBuilder.group(CycleHttpApi, "v1", (handlers) =>
  withAutomationHandlers(
    withInitiativeHandlers(
      withTemplateHandlers(
        withViewHandlers(
          withUserHandlers(
            withLabelHandlers(
              withDraftHandlers(
                withCommentHandlers(withIssueHandlers(withRepositoryHandlers(handlers))),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);
