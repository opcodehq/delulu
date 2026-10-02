export const resolveAuthenticatedToken = async (
  getToken: () => Promise<string | null>,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<string> => {
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 75;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const token = await getToken();
    if (token) {
      return token;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * 2 ** attempt)
      );
    }
  }
  throw new Error("Your session is still loading. Please try again.");
};
