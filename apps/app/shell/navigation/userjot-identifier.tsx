"use client";

import { useUser } from "@delulu/auth";
import { Suspense, useEffect, useRef } from "react";

// Extend window object to include UserJot types
declare global {
  interface Window {
    $ujq?: [string, ...unknown[]][];
    uj?: {
      init: (projectId: string, config?: UserJotConfig) => void;
      identify: (userData: UserJotIdentifyData) => void;
    };
  }
}

interface UserJotConfig {
  widget?: boolean;
  position?: "left" | "right";
  theme?: "auto" | "light" | "dark";
}

interface UserJotIdentifyData {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

function UserJotIdentifierContent() {
  const { user } = useUser();
  const identified = useRef(false);
  const initialized = useRef(false);

  // Initialize UserJot widget
  useEffect(() => {
    if (!window.uj || initialized.current) {
      return;
    }

    window.uj.init("cmhq5pxc8033614nyqxr0iqg6", {
      widget: true,
      position: "right",
      theme: "auto",
    });

    initialized.current = true;
  }, []);

  // Identify user when authenticated
  useEffect(() => {
    if (!(user && window.uj) || identified.current) {
      return;
    }

    window.uj.identify({
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      avatar: user.imageUrl,
    });

    console.log("Identified user:", user.id);

    identified.current = true;
  }, [user]);

  return null;
}

export const UserJotIdentifier = () => {
  return (
    <Suspense>
      <UserJotIdentifierContent />
    </Suspense>
  );
};
