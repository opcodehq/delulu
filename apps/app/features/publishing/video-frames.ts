/**
 * Video frame extraction utilities for thumbnail generation
 */

export interface VideoFrameResult {
  blob: Blob;
  dataUrl: string;
  timestamp: number;
}

/**
 * Creates a video element with the given source and seeks to a timestamp.
 * Tries crossOrigin="anonymous" first (fast, streaming). If the video fails
 * to load (e.g. no CORS headers), falls back to fetching the URL as a blob
 * and using a local object URL.
 */
function loadVideoAtTimestamp(
  src: string,
  timestamp: number
): Promise<{ video: HTMLVideoElement; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let blobUrl: string | null = null;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error("Video frame extraction timeout"));
    }, 15_000);

    const onReady = () => {
      video.addEventListener(
        "seeked",
        () => {
          clearTimeout(timeoutId);
          resolve({
            video,
            cleanup: () => {
              if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
              }
            },
          });
        },
        { once: true }
      );
      video.currentTime = timestamp;
    };

    // Attempt 1: load with crossOrigin (fast, streaming)
    video.crossOrigin = "anonymous";
    video.addEventListener("loadedmetadata", () => onReady(), { once: true });

    video.addEventListener(
      "error",
      () => {
        if (timedOut) {
          return;
        }
        // crossOrigin load failed — fall back to fetching as blob
        video.crossOrigin = "";
        video.removeAttribute("crossOrigin");
        fetch(src)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`Fetch failed: ${res.status}`);
            }
            return res.blob();
          })
          .then((blob) => {
            if (timedOut) {
              return;
            }
            blobUrl = URL.createObjectURL(blob);
            video.addEventListener("loadedmetadata", () => onReady(), {
              once: true,
            });
            video.addEventListener(
              "error",
              () => {
                if (!timedOut) {
                  clearTimeout(timeoutId);
                  if (blobUrl) {
                    URL.revokeObjectURL(blobUrl);
                  }
                  reject(new Error("Failed to load video (blob fallback)"));
                }
              },
              { once: true }
            );
            video.src = blobUrl;
            video.load();
          })
          .catch((err) => {
            if (!timedOut) {
              clearTimeout(timeoutId);
              reject(
                new Error(
                  `Failed to load video: ${err instanceof Error ? err.message : err}`
                )
              );
            }
          });
      },
      { once: true }
    );

    video.src = src;
    video.load();
  });
}

/**
 * Extracts a frame from a video at a specific timestamp
 * @param videoFile - The video file or URL to extract from
 * @param timestamp - Time in seconds (default: middle of video)
 * @returns Frame as blob and data URL
 */
export async function extractVideoFrame(
  videoFile: File | string,
  timestamp?: number
): Promise<VideoFrameResult> {
  // For File objects, use a local object URL directly (no CORS issues)
  if (typeof videoFile !== "string") {
    const objectUrl = URL.createObjectURL(videoFile);
    try {
      return await extractFrameFromUrl(objectUrl, timestamp);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // For URLs, use the crossOrigin + fallback approach
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  const { video, cleanup } = await loadVideoAtTimestamp(
    videoFile,
    timestamp ?? 0 // Will be overridden once we know the duration
  );

  // If no timestamp was provided, seek to middle
  if (timestamp === undefined) {
    video.currentTime = video.duration / 2;
    await new Promise<void>((resolve) =>
      video.addEventListener("seeked", () => resolve(), { once: true })
    );
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        cleanup();
        if (!blob) {
          reject(new Error("Failed to create blob from canvas"));
          return;
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve({ blob, dataUrl, timestamp: video.currentTime });
      },
      "image/jpeg",
      0.9
    );
  });
}

/**
 * Simple frame extraction from a local URL (no CORS issues)
 */
function extractFrameFromUrl(
  url: string,
  timestamp?: number
): Promise<VideoFrameResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    video.addEventListener("loadedmetadata", () => {
      video.currentTime = timestamp ?? video.duration / 2;
    });

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob from canvas"));
            return;
          }
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          resolve({ blob, dataUrl, timestamp: video.currentTime });
        },
        "image/jpeg",
        0.9
      );
    });

    video.addEventListener("error", () => {
      reject(new Error("Failed to load video"));
    });

    setTimeout(
      () => reject(new Error("Video frame extraction timeout")),
      15_000
    );
    video.src = url;
    video.load();
  });
}

/**
 * Converts a blob to a File object
 */
export function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/**
 * Format timestamp for display (MM:SS)
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
