import { expect, type Page, test } from "@playwright/test";

const WHO_CAN_REPLY = /Who can reply/;
const ADD_MEDIA = /^Add media/;

const twitterSettings = (page: Page) =>
  expect.poll(() =>
    page.evaluate(() =>
      (Reflect.get(window, "twitterSettings") as () => unknown)()
    )
  );

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem("theme", theme),
    info.project.name === "mobile-dark" ? "dark" : "light"
  );
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:4180"
      ? route.continue()
      : route.abort()
  );
});
test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(() => Reflect.get(window, "fixtureUnhandled") ?? [])
  ).toEqual([]);
});

interface Store {
  getState: () => {
    post: {
      content: { text: string }[];
      alternativeContent: {
        socialProvider: { socialId: string };
        content: { text: string }[];
      }[];
    };
    setPost: (update: (post: never) => unknown) => void;
    setSelectedSocialProviders: (providers: unknown[]) => void;
    selectedSocialProviders: unknown[];
  };
}

/** Opens the X composer fixture once its state is ready. */
const openComposer = async (page: Page) => {
  await page.goto("/__twitter");
  await expect(page.getByRole("group", { name: "X format" })).toBeVisible();
};

/** Attaches a ready video to the first post, as an upload would. */
const attachVideo = (page: Page) =>
  page.evaluate(() => {
    const store = Reflect.get(window, "composerStore") as Store;
    store.getState().setPost(((post: { content: { media: unknown[] }[] }) => ({
      ...post,
      content: post.content.map((item, index) =>
        index === 0
          ? { ...item, media: [{ mediaType: "VIDEO", url: "/clip.mp4" }] }
          : item
      ),
    })) as never);
  });

test("a quote stays visible and removable after a video is added", async ({
  page,
}) => {
  await openComposer(page);
  await page.getByRole("button", { name: "Quote a post" }).click();
  await page.getByLabel("Post to quote").fill("1234567890123456789");
  await attachVideo(page);
  await expect(page.getByLabel("Post to quote")).toHaveValue(
    "1234567890123456789"
  );
  await page.getByRole("button", { name: "Remove quote" }).click();
  await twitterSettings(page).toMatchObject({ quoteTweetId: "" });
  await page.getByRole("button", { name: "Quote a post" }).click();
  await expect(page.getByLabel("Post to quote")).toBeFocused();
});

test("an X-only Article keeps its title and shows media as the cover", async ({
  page,
}) => {
  await openComposer(page);
  await attachVideo(page);
  await page.getByRole("radio", { name: "Article" }).click();
  await page.getByLabel("Article title").fill("With a clip");
  await expect(
    page.getByRole("button", { name: "Remove media" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cover" })).toHaveCount(0);
  await twitterSettings(page).toMatchObject({
    format: "article",
    articleTitle: "With a clip",
  });
});

test("an Article sharing content with video platforms keeps its title", async ({
  page,
}) => {
  await openComposer(page);
  await page.evaluate(() => {
    const state = (Reflect.get(window, "composerStore") as Store).getState();
    state.setSelectedSocialProviders([
      ...state.selectedSocialProviders,
      {
        socialId: "connection_threads",
        socialType: "THREADS",
        name: "Threads",
      },
    ]);
  });
  await page.getByRole("radio", { name: "Article" }).click();
  await attachVideo(page);
  await page.getByLabel("Article title").fill("Shared clip");
  await twitterSettings(page).toMatchObject({ articleTitle: "Shared clip" });
});

test("an Article keeps the thread other channels still publish", async ({
  page,
}) => {
  await openComposer(page);
  await page.evaluate(() => {
    const state = (Reflect.get(window, "composerStore") as Store).getState();
    state.setSelectedSocialProviders([
      ...state.selectedSocialProviders,
      {
        socialId: "connection_threads",
        socialType: "THREADS",
        name: "Threads",
      },
    ]);
  });
  await page
    .getByRole("button", { name: "Add another post to thread" })
    .click();
  await page.getByLabel("Post 2", { exact: true }).fill("Second paragraph");
  await page.getByRole("radio", { name: "Article" }).click();

  const post = await page.evaluate(() => {
    const state = (Reflect.get(window, "composerStore") as Store).getState();
    return {
      shared: state.post.content.map((item) => item.text),
      custom: state.post.alternativeContent.map((item) => ({
        id: item.socialProvider.socialId,
        texts: item.content.map((segment) => segment.text),
      })),
      opened: Reflect.get(window, "openedChannel"),
    };
  });
  expect(post).toEqual({
    shared: ["My article body", "Second paragraph"],
    custom: [
      {
        id: "connection_twitter",
        texts: ["My article body\n\nSecond paragraph"],
      },
    ],
    opened: "connection_twitter",
  });
  await twitterSettings(page).toMatchObject({ format: "article" });
});

test("X quotes and reply audience are edited inline in the composer", async ({
  page,
}, info) => {
  await openComposer(page);
  await expect(page.getByLabel("Post to quote")).toHaveCount(0);
  await page.getByRole("button", { name: "Quote a post" }).click();
  const quote = page.getByLabel("Post to quote");
  await expect(quote).toBeFocused();
  await quote.fill("https://evil.test/post/123");
  await expect(page.getByText("isn't an X post link")).toBeVisible();
  await expect(quote).toHaveAttribute("aria-invalid", "true");
  await quote.fill("https://x.com/wiz/status/1234567890123456789");
  await expect(
    page.getByText("Quoting post 1234567890123456789")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Quote a post" })).toHaveCount(
    0
  );

  await page.getByRole("button", { name: WHO_CAN_REPLY }).click();
  await page
    .getByRole("menuitemradio", { name: "Only accounts you mention can reply" })
    .click();
  await expect(
    page.getByRole("button", { name: WHO_CAN_REPLY })
  ).toHaveAccessibleName("Who can reply: Only accounts you mention can reply");
  await twitterSettings(page).toMatchObject({
    replyRestriction: "mentioned",
    quoteTweetId: "https://x.com/wiz/status/1234567890123456789",
  });
  if (info.project.name === "mobile-dark") {
    for (const name of ["Remove quote", "Who can reply"]) {
      const box = await page
        .getByRole("button", { name: new RegExp(name) })
        .boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({
    path: `../../.context/twitter-quote-${info.project.name}.png`,
  });

  await page.getByRole("button", { name: "Remove quote" }).click();
  await expect(quote).toHaveCount(0);
  await twitterSettings(page).toMatchObject({ quoteTweetId: "" });
  await expect(
    page.getByRole("button", { name: "Quote a post" })
  ).toBeVisible();
});

test("switching X to Article folds the thread into one titled body", async ({
  page,
}, info) => {
  await openComposer(page);
  await expect(page.getByLabel("Characters used")).toHaveText("15 / 280");
  await page
    .getByRole("button", { name: "Add another post to thread" })
    .click();
  await page.getByLabel("Post 2", { exact: true }).fill("Second paragraph");
  await page.getByRole("button", { name: "Quote a post" }).click();
  await page.getByLabel("Post to quote").fill("1234567890123456789");

  await page.getByRole("radio", { name: "Article" }).click();
  await expect(page.getByLabel("Post content", { exact: true })).toHaveValue(
    "My article body\n\nSecond paragraph"
  );
  await expect(page.getByLabel("Post 2", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Characters used")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add another post to thread" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quote a post" })).toHaveCount(
    0
  );
  await expect(page.getByLabel("Post to quote")).toHaveCount(0);
  await expect(page.getByRole("button", { name: WHO_CAN_REPLY })).toHaveCount(
    0
  );

  await page.getByLabel("Article title").fill("My native X Article");
  await twitterSettings(page).toMatchObject({
    format: "article",
    articleTitle: "My native X Article",
    quoteTweetId: "",
  });
  await expect(page.getByRole("button", { name: "Add cover" })).toBeVisible();
  await expect(page.getByRole("button", { name: ADD_MEDIA })).toHaveCount(0);
  const toggle = await page
    .getByRole("radio", { name: "Article" })
    .boundingBox();
  expect(toggle?.height).toBeGreaterThanOrEqual(
    info.project.name === "mobile-dark" ? 44 : 32
  );
  await page.screenshot({
    path: `../../.context/twitter-article-${info.project.name}.png`,
  });

  await page.getByRole("radio", { name: "Post" }).click();
  await expect(page.getByLabel("Article title")).toHaveCount(0);
  await expect(page.getByLabel("Characters used")).toBeVisible();
  await twitterSettings(page).toMatchObject({ format: "post" });
  await expect(page.getByRole("button", { name: "Add cover" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: ADD_MEDIA })).toBeVisible();
});
