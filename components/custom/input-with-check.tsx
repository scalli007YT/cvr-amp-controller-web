"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface InputWithCheckProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onCommit?: () => void;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function InputWithCheck({
  value,
  onChange,
  onBlur,
  onCommit,
  maxLength,
  className,
  disabled,
  placeholder
}: InputWithCheckProps) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="relative">
      <Input
        value={value}
        maxLength={maxLength}
        className={`${className ?? ""} pr-10`}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setIsActive(true)}
        onBlur={() => {
          setIsActive(false);
          onBlur?.();
        }}
        onChange={(e) => onChange(e.target.value)}
      />

      {isActive && !disabled && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          onMouseDown={(e) => {
            // Keep focus on input so blur-confirm flow is not triggered by check-click.
            e.preventDefault();
          }}
          onClick={() => onCommit?.()}
          aria-label="Apply name"
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
