"use client";

import { runEffect } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { useEffect, useState } from "react";
import { useApiClient } from "@/components/providers/api-client";

interface Skill {
  id: string;
  title: string;
  instructions: string;
  revision: number;
  enabled: boolean;
}
export function AgentSkills({ workspaceId }: { workspaceId: string }) {
  const { client } = useApiClient();
  const [skills, setSkills] = useState<readonly Skill[]>([]);
  const [selected, setSelected] = useState<Skill>();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string>();
  useEffect(() => {
    let active = true;
    setSkills([]);
    setSelected(undefined);
    setTitle("");
    setInstructions("");
    setError("");
    runEffect(client.agentChannels.skills({ params: { workspaceId } }))
      .then((items) => {
        if (active) {
          setSkills(items);
        }
      })
      .catch(() => {
        if (active) {
          setError("Skills are available to invited agent beta users.");
        }
      });
    return () => {
      active = false;
    };
  }, [client, workspaceId]);
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      if (remove && selected) {
        await runEffect(
          client.agentChannels.deleteSkill({
            params: { workspaceId, id: selected.id },
          })
        );
      } else {
        await runEffect(
          client.agentChannels.saveSkill({
            params: { workspaceId },
            payload: {
              id: selected?.id,
              revision: selected?.revision,
              title,
              instructions,
              enabled: true,
            },
          })
        );
      }
      setSkills(
        await runEffect(
          client.agentChannels.skills({ params: { workspaceId } })
        )
      );
      setSelected(undefined);
      setTitle("");
      setInstructions("");
    } catch {
      setError(
        "Unable to save. Check your access or reload if someone else edited this skill."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-5" id="skills">
      <summary className="min-h-11 cursor-pointer font-medium">
        Workspace skills
      </summary>
      <p className="mb-4 text-muted-foreground text-sm">
        Reusable instructions for your assistant across connected channels.
        Skills cannot grant permissions or run installed code.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {skills.map((skill) => (
          <Button
            className="min-h-11"
            disabled={busy}
            key={skill.id}
            onClick={() => {
              setSelected(skill);
              setTitle(skill.title);
              setInstructions(skill.instructions);
            }}
            variant="outline"
          >
            {skill.title}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        <label className="block" htmlFor="agent-skill-title">
          Skill name
        </label>
        <Input
          id="agent-skill-title"
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          readOnly={selected?.id.startsWith("builtin:")}
          value={title}
        />
        <label className="block" htmlFor="agent-skill-instructions">
          Instructions
        </label>
        <Textarea
          className="min-h-40"
          id="agent-skill-instructions"
          maxLength={12_000}
          onChange={(e) => setInstructions(e.target.value)}
          readOnly={selected?.id.startsWith("builtin:")}
          value={instructions}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            disabled={
              busy ||
              !title.trim() ||
              !instructions.trim() ||
              selected?.id.startsWith("builtin:")
            }
            onClick={() => save()}
          >
            {busy ? "Saving…" : "Save skill"}
          </Button>
          <Button
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              setSelected(undefined);
              setTitle("");
              setInstructions("");
            }}
            variant="outline"
          >
            New skill
          </Button>
          {selected && !selected.id.startsWith("builtin:") && (
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                deleteId === selected.id ? save(true) : setDeleteId(selected.id)
              }
              variant="outline"
            >
              {deleteId === selected.id ? "Confirm removal" : "Remove skill"}
            </Button>
          )}
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
