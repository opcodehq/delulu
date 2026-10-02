/**
 * View-model types for the new typed HTTP API (`@delulu/client`), derived from
 * resource Effects so UI components stay in sync with the contract
 * without duplicating the schema. These replace the legacy `types/backend.ts`
 * shapes for `PostView`-based screens.
 */
import type {
  createResourceEffects,
  ResourceEffectSuccess,
} from "@delulu/client";

type Resources = ReturnType<typeof createResourceEffects>;

type ResourceData<T> = ResourceEffectSuccess<T>;

export type PostsPage = ResourceData<ReturnType<Resources["posts"]["list"]>>;
export type PostView = PostsPage["data"][number];
export type TargetView = PostView["targets"][number];
export type PostStatus = PostView["status"];

export type ConnectionsPage = ResourceData<
  ReturnType<Resources["connections"]["list"]>
>;
export type ConnectionView = ConnectionsPage["data"][number];

export type MediaView = ResourceData<ReturnType<Resources["media"]["get"]>>;
