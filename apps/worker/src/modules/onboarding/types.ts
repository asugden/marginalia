// Shapes for the onboarding module. The worker stores these as opaque JSON:
// what a preset or a context means is decided by the web app's descriptors,
// so a new tour step never needs a worker change.

export interface OnboardingProgressRow {
  user_id: string;
  course_id: string;
  preset_json: string;
  context_json: string;
  step: number;
  completed_at: number | null;
  dismissed_at: number | null;
  updated_at: number;
}

export interface OnboardingProgressDTO {
  courseId: string;
  preset: Record<string, unknown>;
  context: Record<string, unknown>;
  step: number;
  completedAt: number | null;
  dismissedAt: number | null;
}

export interface ProgressPatch {
  preset?: Record<string, unknown>;
  context?: Record<string, unknown>;
  step?: number;
  completed?: boolean;
  dismissed?: boolean;
}
