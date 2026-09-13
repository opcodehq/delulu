export * from "./content.js";

export default {
  async fetch(): Promise<Response> {
    return new Response("Delulu Content Gatekeeper is running.");
  },
};
