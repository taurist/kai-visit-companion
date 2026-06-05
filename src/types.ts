export type DecisionKind = "take" | "defer" | "continue" | "discuss";
export type QuestionStatus = "open" | "asked" | "answered" | "follow_up";
export type QuestionGroup = "vaccines" | "growth" | "development" | "logistics" | "other";

export type VisitDecision = {
  id: string;
  title: string;
  stance: string;
  kind: DecisionKind;
  reason: string;
  timing: string;
  deadline: string;
  pushback: string;
  why?: string;
};

export type VisitTask = {
  id: string;
  label: string;
  category: QuestionGroup;
  asked: boolean;
  answered: boolean;
  scheduled: boolean;
  followUp: boolean;
  note: string;
  why?: string;
};

export type VisitQuestion = {
  id: string;
  group: QuestionGroup;
  text: string;
  status: QuestionStatus;
  answer: string;
  why?: string;
};

export type PushbackScript = {
  id: string;
  prompt: string;
  reply: string;
  why?: string;
};

export type VisitDocument = {
  version: 1;
  profile: {
    childLabel: string;
    visitLabel: string;
    dateLabel: string;
    summary: string;
  };
  summary: {
    today: string[];
    deferred: string[];
    schedule: string[];
    beforeLeaving: string[];
  };
  decisions: VisitDecision[];
  tasks: VisitTask[];
  questions: VisitQuestion[];
  scripts: PushbackScript[];
  notes: string;
  outcomes: {
    pcvProduct: string;
    rotavirusProduct: string;
    nextVaccineDate: string;
    growthTarget: string;
    referrals: string;
  };
};

export type SyncStatus =
  | { mode: "local"; message: string }
  | { mode: "connecting"; message: string }
  | { mode: "synced"; message: string; updatedAt?: string }
  | { mode: "error"; message: string };

export const questionGroups: Array<{ id: QuestionGroup; label: string }> = [
  { id: "vaccines", label: "Vaccines" },
  { id: "growth", label: "Growth" },
  { id: "development", label: "Development" },
  { id: "logistics", label: "Logistics" },
  { id: "other", label: "Other" },
];
