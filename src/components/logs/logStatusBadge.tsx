import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Bug,
  CheckCircle2,
  Clock3,
  Info,
  PauseCircle,
  XCircle,
} from "lucide-react";

import type { BadgeTone } from "@/components/ui/badge";

// Operation-log status / level → <Badge> semantics (DESIGN.md pill-status).
// Mint = completed, lavender = in progress (secondary data), amber = partial /
// interrupted, rose = failed, neutral = cancelled / unknown. Every state also
// carries an icon and translated text, so colour is never alone.

export interface LogBadgeVisual {
  tone: BadgeTone;
  icon: ReactNode;
}

export function logStatusBadge(status: string): LogBadgeVisual {
  switch (status) {
    case "succeeded":
      return { tone: "success", icon: <CheckCircle2 /> };
    case "failed":
      return { tone: "destructive", icon: <XCircle /> };
    case "partial":
      return { tone: "warning", icon: <AlertCircle /> };
    case "cancelled":
      return { tone: "neutral", icon: <Ban /> };
    case "interrupted":
      return { tone: "warning", icon: <PauseCircle /> };
    case "started":
      return { tone: "info", icon: <Clock3 /> };
    default:
      return { tone: "neutral", icon: <Info /> };
  }
}

export function logLevelBadge(level: string): LogBadgeVisual {
  switch (level) {
    case "error":
      return { tone: "destructive", icon: <XCircle /> };
    case "warn":
      return { tone: "warning", icon: <AlertTriangle /> };
    case "debug":
    case "trace":
      return { tone: "info", icon: <Bug /> };
    default:
      return { tone: "neutral", icon: <Info /> };
  }
}
