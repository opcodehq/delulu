import type { SocialType } from "@delulu/core/publishing/post";

export interface BulkVideo {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  uploadStatus: "pending" | "uploading" | "uploaded" | "failed";
  uploadResult?: { bucketKey: string; url: string; mediaId?: string };
  validationErrors: string[];
  postStatus?: "pending" | "creating" | "created" | "failed";
}

export interface SelectedProvider {
  socialId: string;
  name: string;
  socialType: SocialType;
}

export interface BulkUploadState {
  videos: BulkVideo[];
  selectedProviders: SelectedProvider[];
  startDate: Date | null;
  intervalMinutes: number;
  submissionStatus: "idle" | "submitting" | "done" | "partial-failure";
}

export type BulkUploadAction =
  | { type: "ADD_VIDEOS"; videos: BulkVideo[] }
  | { type: "REMOVE_VIDEO"; id: string }
  | { type: "MOVE_VIDEO"; id: string; direction: "up" | "down" }
  | { type: "SET_CAPTION"; id: string; caption: string }
  | {
      type: "SET_UPLOAD_STATUS";
      id: string;
      status: BulkVideo["uploadStatus"];
      result?: { bucketKey: string; url: string; mediaId?: string };
    }
  | {
      type: "SET_POST_STATUS";
      id: string;
      status: NonNullable<BulkVideo["postStatus"]>;
    }
  | { type: "SET_VALIDATION_ERRORS"; id: string; errors: string[] }
  | { type: "SET_PROVIDERS"; providers: SelectedProvider[] }
  | { type: "TOGGLE_PROVIDER"; provider: SelectedProvider }
  | { type: "SET_START_DATE"; date: Date | null }
  | { type: "SET_INTERVAL"; minutes: number }
  | {
      type: "SET_SUBMISSION_STATUS";
      status: BulkUploadState["submissionStatus"];
    }
  | { type: "RESET" };

export const initialState: BulkUploadState = {
  videos: [],
  selectedProviders: [],
  startDate: null,
  intervalMinutes: 120,
  submissionStatus: "idle",
};

export function bulkUploadReducer(
  state: BulkUploadState,
  action: BulkUploadAction
): BulkUploadState {
  switch (action.type) {
    case "ADD_VIDEOS":
      return { ...state, videos: [...state.videos, ...action.videos] };

    case "REMOVE_VIDEO": {
      const video = state.videos.find((v) => v.id === action.id);
      if (video) {
        URL.revokeObjectURL(video.previewUrl);
      }
      return {
        ...state,
        videos: state.videos.filter((v) => v.id !== action.id),
      };
    }

    case "MOVE_VIDEO": {
      const idx = state.videos.findIndex((v) => v.id === action.id);
      if (idx === -1) {
        return state;
      }
      const newIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= state.videos.length) {
        return state;
      }
      const videos = [...state.videos];
      [videos[idx], videos[newIdx]] = [videos[newIdx], videos[idx]];
      return { ...state, videos };
    }

    case "SET_CAPTION":
      return {
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id ? { ...v, caption: action.caption } : v
        ),
      };

    case "SET_UPLOAD_STATUS":
      return {
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id
            ? {
                ...v,
                uploadStatus: action.status,
                uploadResult: action.result ?? v.uploadResult,
              }
            : v
        ),
      };

    case "SET_POST_STATUS":
      return {
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id ? { ...v, postStatus: action.status } : v
        ),
      };

    case "SET_VALIDATION_ERRORS":
      return {
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id ? { ...v, validationErrors: action.errors } : v
        ),
      };

    case "SET_PROVIDERS":
      return { ...state, selectedProviders: action.providers };

    case "TOGGLE_PROVIDER": {
      const exists = state.selectedProviders.some(
        (p) => p.socialId === action.provider.socialId
      );
      return {
        ...state,
        selectedProviders: exists
          ? state.selectedProviders.filter(
              (p) => p.socialId !== action.provider.socialId
            )
          : [...state.selectedProviders, action.provider],
      };
    }

    case "SET_START_DATE":
      return { ...state, startDate: action.date };

    case "SET_INTERVAL":
      return { ...state, intervalMinutes: action.minutes };

    case "SET_SUBMISSION_STATUS":
      return { ...state, submissionStatus: action.status };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export function computeScheduledAt(
  index: number,
  startDate: Date,
  intervalMinutes: number
): number {
  return startDate.getTime() + index * intervalMinutes * 60 * 1000;
}
