"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

interface NavigationContextValue {
  isPending: boolean;
  setPending: (pending: boolean) => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  isPending: false,
  setPending: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isPending, setIsPending] = useState(false);

  // Clear pending state the moment the real pathname changes
  useEffect(() => {
    setIsPending(false);
  }, [pathname]);

  const setPending = useCallback((v: boolean) => setIsPending(v), []);

  return (
    <NavigationContext.Provider value={{ isPending, setPending }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
