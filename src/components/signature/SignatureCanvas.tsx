"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

// Fixed intrinsic dimensions for consistent PNG output.
// 400×200 yields a small file (typically 3–15 KB for a drawn signature).
const CANVAS_W = 400;
const CANVAS_H = 200;

export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

interface Props {
  className?: string;
  /** Called whenever the empty/non-empty state changes */
  onChange?: (isEmpty: boolean) => void;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(
  function SignatureCanvas({ className, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const hasStrokes = useRef(false);

    // Keep a stable ref to onChange so event handlers never go stale
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; });

    // Initial canvas setup: white background + stroke style
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d")!;
      c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-belt-white').trim() || '#ffffff';
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() || '#1a1a1a';
      c.lineWidth = 2.5;
      c.lineCap = "round";
      c.lineJoin = "round";
    }, []);

    // Attach all pointer/touch event listeners
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d")!;

      /** Map a client coordinate to canvas logical pixels, accounting for CSS scaling */
      const toCanvas = (clientX: number, clientY: number) => {
        const r = canvas.getBoundingClientRect();
        return {
          x: ((clientX - r.left) / r.width) * CANVAS_W,
          y: ((clientY - r.top) / r.height) * CANVAS_H,
        };
      };

      const startStroke = (x: number, y: number) => {
        isDrawing.current = true;
        c.beginPath();
        c.moveTo(x, y);
      };

      const continueStroke = (x: number, y: number) => {
        if (!isDrawing.current) return;
        c.lineTo(x, y);
        c.stroke();
      };

      const endStroke = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        if (!hasStrokes.current) {
          hasStrokes.current = true;
          onChangeRef.current?.(false);
        }
      };

      // Mouse handlers
      const onMouseDown = (e: MouseEvent) => {
        const { x, y } = toCanvas(e.clientX, e.clientY);
        startStroke(x, y);
      };
      const onMouseMove = (e: MouseEvent) => {
        const { x, y } = toCanvas(e.clientX, e.clientY);
        continueStroke(x, y);
      };

      // Touch handlers — passive: false so we can preventDefault (stops page scroll)
      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.touches[0];
        const { x, y } = toCanvas(t.clientX, t.clientY);
        startStroke(x, y);
      };
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.touches[0];
        const { x, y } = toCanvas(t.clientX, t.clientY);
        continueStroke(x, y);
      };
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        endStroke();
      };

      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("mouseup", endStroke);
      canvas.addEventListener("mouseleave", endStroke);
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", onTouchEnd, { passive: false });

      return () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseup", endStroke);
        canvas.removeEventListener("mouseleave", endStroke);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
      };
    }, []); // intentionally empty — stable via refs

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const c = canvas.getContext("2d")!;
        c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-belt-white').trim() || '#ffffff';
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
        hasStrokes.current = false;
        onChangeRef.current?.(true);
      },
      isEmpty: () => !hasStrokes.current,
      /** Returns a PNG data URL. The 400×200 canvas produces a compact file. */
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    }));

    return (
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={className}
        // touchAction:none stops browser pan/zoom while drawing
        style={{ touchAction: "none", cursor: "crosshair" }}
      />
    );
  }
);
