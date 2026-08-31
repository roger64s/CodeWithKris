export type PilotStatus = "draft" | "submitted" | "active" | "completed";
export type TaskStatus = "backlog" | "assigned" | "in_progress" | "awaiting_review" | "verified";
export type TargetStatus = "research" | "client_review" | "prioritized" | "outreach" | "converted";
export type MessageStatus = "draft" | "client_review" | "approved" | "retired";
export type OutreachChannel = "local_language" | "email" | "call" | "video_call";
export type ParticipantGroup = "PwD" | "Student" | "Woman" | "Caregiver" | "Mentor" | "Open community";

export type GtmProject = {
  id: string;
  client_user_id: string | null;
  client_name: string;
  name: string;
  objective: string;
  target_market: string;
  languages: string[];
  status: PilotStatus;
};

export type GtmTask = {
  id: string;
  project_id: string;
  task_type: string;
  title: string;
  description: string;
  participant_group: ParticipantGroup;
  assignee_user_id: string | null;
  assignee_name: string | null;
  status: TaskStatus;
  task_data: Record<string, unknown>;
  ovu_status: "not_started" | "pending_verification" | "recorded";
  ovu_value: number | null;
};

export type GtmTarget = {
  id: string;
  project_id: string;
  target_code: string;
  company_name: string;
  contact_title: string;
  segment: string;
  market: string;
  status: TargetStatus;
  priority: number | null;
};

export type GtmMessage = {
  id: string;
  project_id: string;
  name: string;
  locale: string;
  channel: OutreachChannel;
  content: string;
  status: MessageStatus;
};

export type GtmOutreachEvent = {
  id: string;
  project_id: string;
  target_code: string;
  locale: string;
  channel: OutreachChannel;
  outcome: string;
  occurred_at: string;
  appointment_at: string | null;
};

export const STANDARD_MILESTONES = [
  { key: "research", label: "Verified target research", minimumHkd: 1500, maximumHkd: 2500 },
  { key: "contact_approval", label: "Client contact approval", minimumHkd: 2000, maximumHkd: 3000 },
  { key: "meeting_confirmation", label: "Confirmed client meeting", minimumHkd: 3500, maximumHkd: 5000 },
] as const;

export const DEFAULT_DEPARTMENT_SPLITS = [
  { department: "Management", percentage: 10 },
  { department: "Delivery", percentage: 30 },
  { department: "Finance & Admin", percentage: 20 },
  { department: "Sales & Marketing", percentage: 20 },
  { department: "Customer Service", percentage: 10 },
  { department: "Profit", percentage: 10 },
] as const;