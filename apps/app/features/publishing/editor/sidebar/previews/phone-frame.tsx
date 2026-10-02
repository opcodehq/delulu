"use client";

import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  /** Force dark mode for the phone screen (e.g. TikTok, Reels). When false/undefined, follows the app theme. */
  darkMode?: boolean;
  className?: string;
}

export function PhoneFrame({ children, darkMode, className }: PhoneFrameProps) {
  // When darkMode is explicitly set, use fixed colors.
  // Otherwise use theme-aware classes so light/dark follows the app.
  const screenBg =
    darkMode === true
      ? "bg-black"
      : darkMode === false
        ? "bg-white"
        : "bg-white dark:bg-neutral-950";

  const statusBarText =
    darkMode === true
      ? "text-white/80"
      : darkMode === false
        ? "text-black/80"
        : "text-black/80 dark:text-white/80";

  const signalBarBg =
    darkMode === true
      ? "bg-white/70"
      : darkMode === false
        ? "bg-black/70"
        : "bg-black/70 dark:bg-white/70";

  return (
    <div className={`flex items-center justify-center p-6 ${className ?? ""}`}>
      <div className="relative mx-auto w-[350px]">
        {/* Phone Frame */}
        <div className="relative rounded-[20px] border-8 border-black bg-black shadow-2xl dark:border-neutral-800">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 z-10 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-black dark:bg-neutral-800" />

          {/* Screen */}
          <div
            className={`relative h-[600px] overflow-hidden rounded-[8px] ${screenBg}`}
          >
            {/* Status Bar */}
            <div
              className={`absolute top-0 z-20 flex h-10 w-full items-center justify-between px-4 ${statusBarText}`}
            >
              <span className="text-[11px] tracking-wide">9:41</span>
              <div className="flex items-center gap-1.5">
                <div className={`h-[3px] w-5 rounded ${signalBarBg}`} />
                <div className={`h-[3px] w-5 rounded ${signalBarBg}`} />
                <div className={`h-[3px] w-5 rounded ${signalBarBg}`} />
              </div>
            </div>

            {children}
          </div>
        </div>

        {/* Side Buttons */}
        <div className="absolute top-32 -right-3 h-8 w-1 rounded-r bg-black dark:bg-neutral-800" />
        <div className="absolute top-48 -right-3 h-16 w-1 rounded-r bg-black dark:bg-neutral-800" />
        <div className="absolute top-48 -left-3 h-16 w-1 rounded-l bg-black dark:bg-neutral-800" />
      </div>
    </div>
  );
}
