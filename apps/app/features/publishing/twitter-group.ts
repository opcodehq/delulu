import { DEFAULT_TWITTER_SETTINGS } from "@delulu/core/publishing/constants/settings";
import {
  type ProviderSetting,
  type SocialProviderType,
  SocialTypes,
  type TwitterSettings,
} from "@delulu/core/publishing/post";

type Provider = Pick<SocialProviderType, "socialId" | "socialType">;
type AlternativeContent = readonly {
  readonly socialProvider: { readonly socialId: string };
}[];

/**
 * X accounts that publish one content group: the shared default content, or
 * one account's custom content.
 */
export function twitterGroupProviderIds(
  selected: readonly Provider[],
  alternativeContent: AlternativeContent,
  group: { readonly isGlobal: boolean; readonly socialId: string }
): string[] {
  return selected
    .filter(
      (provider) =>
        provider.socialType === SocialTypes.TWITTER &&
        (group.isGlobal
          ? !alternativeContent.some(
              (item) => item.socialProvider.socialId === provider.socialId
            )
          : provider.socialId === group.socialId)
    )
    .map((provider) => provider.socialId);
}

/**
 * Accounts sharing content share one X format, because Articles and threads
 * need different content. The first account with saved X settings defines it.
 */
export function twitterGroupSettings(
  providerIds: readonly string[],
  providerSettings: Readonly<Record<string, ProviderSetting>>
): TwitterSettings {
  for (const providerId of providerIds) {
    const setting = providerSettings[providerId];
    if (setting?.type === "TWITTER") {
      return setting.settings;
    }
  }
  return DEFAULT_TWITTER_SETTINGS;
}

const sameSettings = (left: TwitterSettings, right: TwitterSettings) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(
    (key) =>
      left[key as keyof TwitterSettings] === right[key as keyof TwitterSettings]
  );
};

/** Settings writes that bring every X account in a group to the group's settings. */
export function twitterGroupWrites(
  providerIds: readonly string[],
  providerSettings: Readonly<Record<string, ProviderSetting>>
): ProviderSetting[] {
  const settings = twitterGroupSettings(providerIds, providerSettings);
  return providerIds.flatMap((providerId) => {
    const current = providerSettings[providerId];
    return current?.type === "TWITTER" &&
      sameSettings(current.settings, settings)
      ? []
      : [
          {
            socialProviderId: providerId,
            type: "TWITTER" as const,
            settings,
          },
        ];
  });
}
