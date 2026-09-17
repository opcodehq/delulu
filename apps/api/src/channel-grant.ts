export function parseChannelGrant(grant: string) {
  if (typeof grant !== "string" || !grant.trim()) {
    throw new Error("Channel grant is required");
  }
  const parts = grant.split(":");
  const [id, generation] = parts;
  if (parts.length !== 2 || !id?.trim() || !generation?.trim()) {
    throw new Error("Invalid channel grant");
  }
  return { id, generation };
}
