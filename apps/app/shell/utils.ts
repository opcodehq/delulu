export const TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = TIMEOUT_MS
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    // Check if the error is due to abort signal (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    // Re-throw the original error to preserve other error details
    throw error;
  }
}
