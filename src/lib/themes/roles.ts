export interface ThemeRole {
  key: string;
  label: string;
  description: string;
}

export const THEME_ROLES: ThemeRole[] = [
  { key: "primary", label: "Primary", description: "Brand accent — buttons, highlights, featured elements" },
  { key: "info", label: "Info", description: "Informational — details, links, secondary highlights" },
  { key: "accent", label: "Accent", description: "Accent — secondary content, categories, style flair" },
  { key: "warm", label: "Warm", description: "Warm — youth, training tiers, supporting categories" },
  { key: "danger", label: "Danger", description: "Danger zone — cancelling, deleting, errors, expired" },
  { key: "success", label: "Success", description: "All good — confirmations, active status, completed" },
];

export interface ThemeRoleColors {
  primary: string;
  info: string;
  accent: string;
  warm: string;
  danger: string;
  success: string;
}
