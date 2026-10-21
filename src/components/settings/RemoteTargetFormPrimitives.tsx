import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SshAuthMethod } from "@/types";

interface FormActionButtonsProps {
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function FormActionButtons({
  isSaving,
  onCancel,
  onSave,
}: FormActionButtonsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row md:col-span-2 md:items-end">
      <Button
        type="button"
        variant="glass"
        className="flex-1"
        disabled={isSaving}
        onClick={onCancel}
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="button"
        className="flex-1"
        disabled={isSaving}
        onClick={onSave}
      >
        {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {t("targets.saveChanges")}
      </Button>
    </div>
  );
}

interface TargetTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TargetTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: TargetTextFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

interface SshAuthMethodButtonsProps {
  id: string;
  value: SshAuthMethod;
  onChange: (value: SshAuthMethod) => void;
}

export function SshAuthMethodButtons({
  id,
  value,
  onChange,
}: SshAuthMethodButtonsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1 xl:col-span-2">
      <span id={id} className="text-xs text-muted-foreground">
        {t("targets.authMethodLabel")}
      </span>
      <div
        className="grid grid-cols-2 gap-0.5 rounded-pill bg-accent p-0.5"
        aria-labelledby={id}
      >
        {(["key", "password"] as const).map((method) => (
          <button
            key={method}
            type="button"
            className={`focus-ring h-8 truncate rounded-pill border px-2 text-xs whitespace-nowrap transition-colors ${
              value === method
                ? "border-primary-stroke bg-primary-tint text-primary-text"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            aria-pressed={value === method}
            onClick={() => onChange(method)}
          >
            {method === "key"
              ? t("targets.authKey")
              : t("targets.authPassword")}
          </button>
        ))}
      </div>
    </div>
  );
}
