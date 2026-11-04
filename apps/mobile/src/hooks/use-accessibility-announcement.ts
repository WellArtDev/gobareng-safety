import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { shouldAnnounceForAccessibility } from "@/utils/accessibility";

export function useAccessibilityAnnouncement(message: string | null): void {
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (
      shouldAnnounceForAccessibility(
        previous.current,
        message,
        Platform.OS === "ios",
      )
    ) {
      AccessibilityInfo.announceForAccessibility(message!);
    }
    previous.current = message;
  }, [message]);
}
