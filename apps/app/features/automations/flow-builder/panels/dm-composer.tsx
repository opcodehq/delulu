"use client";

import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Cancel01Icon, Link01Icon } from "@delulu/icons";
import { nanoid } from "nanoid";
import type { DmButton, SendDmStep } from "../utils/flow-types";

function renderPreview(template: string): string {
  return (template || "")
    .replace(/{username}/g, "john_doe")
    .replace(/{comment_text}/g, "Great post!");
}

interface DmComposerProps {
  step: SendDmStep;
  isFreePlan?: boolean;
  commentPrivateReply?: boolean;
  onChange: (step: SendDmStep) => void;
}

export function DmComposer({
  step,
  isFreePlan,
  commentPrivateReply,
  onChange,
}: DmComposerProps) {
  const privateReplyLinks = commentPrivateReply
    ? (step.buttons ?? []).filter((button) => button.type === "url")
    : [];
  const previewButtons = commentPrivateReply
    ? (step.buttons ?? []).filter((button) => button.type !== "url")
    : (step.buttons ?? []);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Compose your DM</h3>
        <p className="text-muted-foreground text-xs">
          {commentPrivateReply
            ? "Instagram delivers link actions in a comment-triggered first DM as clickable links."
            : "This is exactly how it'll look in their inbox."}
        </p>
      </div>

      {/* Variable insert buttons */}
      <div className="flex gap-2">
        <button
          className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
          onClick={() =>
            onChange({
              ...step,
              messageTemplate: step.messageTemplate + "{username}",
            })
          }
          type="button"
        >
          + username
        </button>
        <button
          className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
          onClick={() =>
            onChange({
              ...step,
              messageTemplate: step.messageTemplate + "{comment_text}",
            })
          }
          type="button"
        >
          + comment
        </button>
      </div>

      {/* Instagram DM bubble editor */}
      <div className="rounded-2xl bg-muted/60 p-4 dark:bg-neutral-900">
        <textarea
          className="w-full resize-none bg-transparent text-foreground text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
          onChange={(e) =>
            onChange({ ...step, messageTemplate: e.target.value })
          }
          placeholder="Type your message..."
          rows={4}
          value={step.messageTemplate}
        />

        {isFreePlan && step.messageTemplate && (
          <p className="mt-2 border-border border-t pt-2 text-[10px] text-muted-foreground">
            - - -
            <br />
            Sent via @delulu.social
          </p>
        )}

        {/* Existing buttons */}
        {(step.buttons?.length ?? 0) > 0 && (
          <div className="mt-3 space-y-3">
            {step.buttons?.map((btn, i) => (
              <div
                className="space-y-2"
                key={`btn-${btn.type === "quick_reply" ? btn.payload : i}`}
              >
                {/* Button title + delete */}
                <div className="flex items-center gap-1.5">
                  <input
                    className="flex-1 rounded-lg bg-background/80 px-3 py-2 text-center text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring dark:bg-neutral-700"
                    maxLength={20}
                    onChange={(e) => {
                      const newButtons = [...(step.buttons ?? [])];
                      newButtons[i] = { ...btn, title: e.target.value };
                      onChange({ ...step, buttons: newButtons });
                    }}
                    placeholder="Button text"
                    value={btn.title}
                  />
                  <button
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      const newButtons = (step.buttons ?? []).filter(
                        (_, idx) => idx !== i
                      );
                      onChange({ ...step, buttons: newButtons });
                    }}
                    type="button"
                  >
                    <Icon icon={Cancel01Icon} size={13} />
                  </button>
                </div>

                {/* Action selector */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    When tapped:
                  </span>
                  <div className="flex rounded-full bg-background/60 p-0.5 dark:bg-neutral-700/60">
                    <button
                      className={cn(
                        "rounded-full px-2.5 py-0.5 font-medium text-[10px] transition-colors",
                        btn.type === "quick_reply"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground"
                      )}
                      onClick={() => {
                        const newButtons = [...(step.buttons ?? [])];
                        newButtons[i] = {
                          type: "quick_reply",
                          title: btn.title,
                          payload: nanoid(10),
                        };
                        onChange({ ...step, buttons: newButtons });
                      }}
                      type="button"
                    >
                      Send reply
                    </button>
                    <button
                      className={cn(
                        "rounded-full px-2.5 py-0.5 font-medium text-[10px] transition-colors",
                        btn.type === "url"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground"
                      )}
                      onClick={() => {
                        const newButtons = [...(step.buttons ?? [])];
                        newButtons[i] = {
                          type: "url",
                          title: btn.title,
                          url: btn.type === "url" ? btn.url : "",
                        };
                        onChange({ ...step, buttons: newButtons });
                      }}
                      type="button"
                    >
                      Open link
                    </button>
                  </div>
                </div>

                {/* URL input */}
                {btn.type === "url" && (
                  <div className="flex items-center gap-2 px-1">
                    <Icon
                      className="shrink-0 text-muted-foreground"
                      icon={Link01Icon}
                      size={12}
                    />
                    <input
                      className="flex-1 rounded-md bg-background/60 px-2.5 py-1.5 text-foreground text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring dark:bg-neutral-700/50"
                      onChange={(e) => {
                        const newButtons = [...(step.buttons ?? [])];
                        newButtons[i] = { ...btn, url: e.target.value };
                        onChange({ ...step, buttons: newButtons });
                      }}
                      placeholder="https://your-link.com"
                      value={btn.url}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add button */}
        {(step.buttons?.length ?? 0) < 3 && (
          <button
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border border-dashed px-3 py-2 text-muted-foreground text-xs transition-colors hover:border-foreground/30 hover:text-foreground"
            onClick={() => {
              const newBtn: DmButton = {
                type: "quick_reply",
                title: "Get content",
                payload: nanoid(10),
              };
              onChange({
                ...step,
                buttons: [...(step.buttons ?? []), newBtn],
              });
            }}
            type="button"
          >
            <Icon icon={Add01Icon} size={12} />
            Add a button
          </button>
        )}
      </div>

      {/* Live preview */}
      {step.messageTemplate && (
        <div className="space-y-1.5">
          <p className="font-medium text-[11px] text-muted-foreground">
            Preview
          </p>
          <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3 dark:bg-neutral-900">
            <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
              {renderPreview(step.messageTemplate)}
            </p>
            {privateReplyLinks.length > 0 && (
              <div className="mt-2.5 space-y-1 text-sm">
                {privateReplyLinks.map((button, index) => (
                  <p key={`private-reply-link-${index}`}>
                    {button.title}:{" "}
                    <span className="text-primary underline">{button.url}</span>
                  </p>
                ))}
              </div>
            )}
            {isFreePlan && (
              <p className="mt-2 border-border border-t pt-2 text-[10px] text-muted-foreground">
                - - -
                <br />
                Sent via @delulu.social
              </p>
            )}
            {previewButtons.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {previewButtons.map((btn, i) => (
                  <div
                    className="flex items-center justify-center rounded-lg bg-background/80 px-3 py-2 text-foreground text-sm dark:bg-neutral-700"
                    key={`preview-btn-${i}`}
                  >
                    {btn.title || "Button"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
