"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_KIOSK_UI_CONFIG,
  type KioskUiConfig,
} from "@/lib/kiosk-ui-config";

const KioskUiContext = createContext<KioskUiConfig | null>(null);

/**
 * Wraps the kiosk tree and exposes the server-loaded `KioskUiConfig` to
 * client components (PinPad, pages) via `useKioskUi()`.
 *
 * Rendered from `src/app/kiosk/layout.tsx` — the config is fetched once per
 * request there and passed down as a plain prop to this client provider.
 */
export function KioskUiProvider({
  config,
  children,
}: {
  config: KioskUiConfig;
  children: React.ReactNode;
}) {
  return (
    <KioskUiContext.Provider value={config}>{children}</KioskUiContext.Provider>
  );
}

/**
 * Reads the kiosk UI config. Falls back to `DEFAULT_KIOSK_UI_CONFIG` if the
 * hook is called outside of `<KioskUiProvider>` — this keeps the PinPad
 * usable in tests, Storybook, or any future surface that doesn't live under
 * the kiosk layout.
 */
export function useKioskUi(): KioskUiConfig {
  return useContext(KioskUiContext) ?? DEFAULT_KIOSK_UI_CONFIG;
}
