import { z } from "zod";

/**
 * Facebook Page Picture Data Schema
 */
export const FacebookPagePictureDataSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
  is_silhouette: z.boolean(),
});

/**
 * Facebook Page Picture Schema
 */
export const FacebookPagePictureSchema = z.object({
  data: FacebookPagePictureDataSchema,
});

/**
 * Facebook Page Cover Schema
 */
export const FacebookPageCoverSchema = z.object({
  id: z.string(),
  source: z.string(),
  offset_y: z.number(),
});

/**
 * Complete Facebook Page Schema (includes sensitive access_token)
 * Used for backend storage and processing only
 */
export const FacebookPageWithTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  category: z.string(),
  picture: FacebookPagePictureSchema.optional(),
  cover: FacebookPageCoverSchema.optional(),
  link: z.string().optional(),
  followers_count: z.number().optional(),
  fan_count: z.number().optional(),
  verification_status: z.string().optional(),
});

/**
 * Public Facebook Page Schema (excludes sensitive access_token)
 * Used for frontend interfaces and API responses
 */
export const FacebookPagePublicSchema = FacebookPageWithTokenSchema.omit({
  access_token: true,
});

/**
 * Facebook Page Connection Input Schema
 * Used for connecting a Facebook page (frontend to backend)
 */
export const FacebookPageConnectionSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  code: z.string(),
});

/**
 * Facebook Page Connection Response Schema
 */
export const FacebookPageConnectionResponseSchema = z.object({
  status: z.enum(["connected", "transfer_required"]),
  connectionId: z.string().optional(),
  sourceWorkspaceId: z.string().optional(),
});

// Export TypeScript types derived from Zod schemas
export type FacebookPagePictureData = z.infer<
  typeof FacebookPagePictureDataSchema
>;
export type FacebookPagePicture = z.infer<typeof FacebookPagePictureSchema>;
export type FacebookPageCover = z.infer<typeof FacebookPageCoverSchema>;
export type FacebookPageWithToken = z.infer<typeof FacebookPageWithTokenSchema>;
export type FacebookPagePublic = z.infer<typeof FacebookPagePublicSchema>;
export type FacebookPageConnection = z.infer<
  typeof FacebookPageConnectionSchema
>;
export type FacebookPageConnectionResponse = z.infer<
  typeof FacebookPageConnectionResponseSchema
>;

/**
 * Array schemas for multiple pages
 */
export const FacebookPagesWithTokenSchema = z.array(
  FacebookPageWithTokenSchema
);
export const FacebookPagesPublicSchema = z.array(FacebookPagePublicSchema);

// Array types
export type FacebookPagesWithToken = z.infer<
  typeof FacebookPagesWithTokenSchema
>;
export type FacebookPagesPublic = z.infer<typeof FacebookPagesPublicSchema>;
