type ButtonAccessibilityOptions = {
  busy?: boolean;
  disabled?: boolean;
  hint?: string;
};

export function buttonAccessibility(
  label: string,
  { busy = false, disabled = false, hint }: ButtonAccessibilityOptions = {},
) {
  return {
    accessibilityRole: "button" as const,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
    accessibilityState: { busy, disabled },
  };
}

export function tabAccessibility(label: string, selected: boolean) {
  return {
    accessibilityRole: "tab" as const,
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export function cardAccessibility(
  label: string,
  hint: string,
  actionable: boolean,
) {
  if (!actionable) return { accessible: false as const };
  return {
    accessible: true as const,
    accessibilityRole: "button" as const,
    accessibilityLabel: label,
    accessibilityHint: hint,
  };
}

export function linkAccessibility(label: string) {
  return {
    accessibilityRole: "link" as const,
    accessibilityLabel: label,
  };
}

export const decorativeAccessibility = {
  accessible: false as const,
  accessibilityElementsHidden: true as const,
  importantForAccessibility: "no" as const,
};

export const minimumTouchTarget = { minHeight: 44, minWidth: 44 } as const;

export function headingAccessibility(label: string) {
  return {
    accessible: true as const,
    accessibilityRole: "header" as const,
    accessibilityLabel: label,
  };
}

export function alertAccessibility(message: string) {
  return {
    accessible: true as const,
    accessibilityRole: "alert" as const,
    accessibilityLabel: message,
    accessibilityLiveRegion: "assertive" as const,
  };
}

export function summaryAccessibility(label: string) {
  return {
    accessible: true as const,
    accessibilityRole: "summary" as const,
    accessibilityLabel: label,
  };
}

export function groupAccessibility(label: string) {
  return {
    accessible: true as const,
    accessibilityLabel: label,
  };
}

export function selectableButtonAccessibility(
  label: string,
  selected: boolean,
) {
  return {
    accessibilityRole: "button" as const,
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export function switchAccessibility(label: string, checked: boolean) {
  return {
    accessibilityRole: "switch" as const,
    accessibilityLabel: label,
    accessibilityState: { checked },
  };
}

export function announcementAccessibility(
  message: string,
  politeness: "polite" | "assertive",
) {
  return {
    accessible: true as const,
    accessibilityLabel: message,
    accessibilityLiveRegion: politeness,
  };
}

export function shouldAnnounceForAccessibility(
  previous: string | null,
  message: string | null,
  isIos: boolean,
): boolean {
  return Boolean(isIos && message?.trim() && message !== previous);
}
