import { useState, useCallback, useRef } from "react";

/**
 * Single-slot error toast with auto-dismiss.
 *
 * Call `showError("message")` to display a toast — it auto-clears after
 * `duration` ms (default 4 s). Pass `message` and `dismiss` to ErrorToast.
 */
export function useToast(duration = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback(
    (msg: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      timerRef.current = setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(null);
  }, []);

  return { message, showError, dismiss };
}
