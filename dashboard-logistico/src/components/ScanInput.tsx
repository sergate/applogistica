"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface ScanInputHandle {
  focus: () => void;
}

interface ScanInputProps {
  onScan: (code: string) => void;
  disabled?: boolean;
}

// Los lectores de código de barras de los handheld actúan como un teclado
// (tipean el código y Enter) -- este input queda invisible pero siempre
// enfocado para capturar eso sin que el navegador abra el teclado en
// pantalla (inputMode="none" lo suprime, sin afectar la entrada
// física/wedge). Mismo patrón que Registro-Inbound (components/ScanInput.tsx).
const ScanInput = forwardRef<ScanInputHandle, ScanInputProps>(({ onScan, disabled }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");

  function focusInput() {
    inputRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({ focus: focusInput }));

  useEffect(() => {
    if (!disabled) focusInput();

    const handleRefocus = () => {
      if (!disabled) focusInput();
    };
    window.addEventListener("focus", handleRefocus);
    document.addEventListener("visibilitychange", handleRefocus);
    document.addEventListener("click", handleRefocus);
    return () => {
      window.removeEventListener("focus", handleRefocus);
      document.removeEventListener("visibilitychange", handleRefocus);
      document.removeEventListener("click", handleRefocus);
    };
  }, [disabled]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = buffer.trim();
    setBuffer("");
    if (code) onScan(code);
  }

  return (
    <input
      ref={inputRef}
      value={buffer}
      onChange={(e) => setBuffer(e.target.value)}
      onKeyDown={handleKeyDown}
      inputMode="none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      disabled={disabled}
      aria-hidden="true"
      tabIndex={-1}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        opacity: 0,
        height: 1,
        width: 1,
        border: "none",
        pointerEvents: "none",
      }}
    />
  );
});

ScanInput.displayName = "ScanInput";

export default ScanInput;
