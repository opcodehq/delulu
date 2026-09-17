import { expect, it } from "vitest";
import {
  approvalLabel,
  connectionButtons,
  presentTelegramReply,
} from "./telegram-presentation";

it("renders only exact server-generated workspace links as buttons", () => {
  const links = connectionButtons(
    "https://staging.delulu.social",
    "workspace_a"
  );
  const result = presentTelegramReply(
    `Use [LinkedIn](${links[0]!.url})`,
    links
  );
  expect(result.rows).toEqual([[links[0]]]);
  expect(result.text).toBe("Use Connect LinkedIn");
  expect(
    presentTelegramReply("[Fake](https://evil.example/connect)", links).rows
  ).toEqual([]);
  const other = connectionButtons(
    "https://staging.delulu.social",
    "workspace_b"
  );
  expect(presentTelegramReply(`[Other](${other[0]!.url})`, links).rows).toEqual(
    []
  );
});
it("deduplicates links and labels content approvals by action", () => {
  const links = connectionButtons(
    "https://staging.delulu.social",
    "workspace_a"
  );
  expect(
    presentTelegramReply(`[A](${links[0]!.url}) [B](${links[0]!.url})`, links)
      .rows
  ).toHaveLength(1);
  expect(approvalLabel("create_draft", 0)).toBe("Save draft");
  expect(approvalLabel("schedule", 0)).toBe("Schedule");
  expect(approvalLabel("publish", 0)).toBe("Publish");
});
