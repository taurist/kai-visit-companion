import type { VisitDocument, VisitQuestion } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export function createBlankDocument(): VisitDocument {
  return {
    version: 1,
    profile: {
      childLabel: "Visit",
      visitLabel: "Appointment",
      dateLabel: "Upcoming visit",
      summary: "Decision record and question tracker",
    },
    summary: {
      today: [],
      deferred: [],
      schedule: [],
      beforeLeaving: [],
    },
    decisions: [],
    tasks: [],
    questions: [],
    scripts: [],
    notes: "",
    outcomes: {
      pcvProduct: "",
      rotavirusProduct: "",
      nextVaccineDate: "",
      growthTarget: "",
      referrals: "",
    },
  };
}

export function normalizeDocument(input: unknown): VisitDocument {
  const blank = createBlankDocument();

  if (!input || typeof input !== "object") {
    return blank;
  }

  const value = input as Partial<VisitDocument>;
  return {
    ...blank,
    ...value,
    version: 1,
    profile: { ...blank.profile, ...value.profile },
    summary: { ...blank.summary, ...value.summary },
    decisions: Array.isArray(value.decisions) ? value.decisions : [],
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    questions: Array.isArray(value.questions) ? value.questions : [],
    scripts: Array.isArray(value.scripts) ? value.scripts : [],
    outcomes: { ...blank.outcomes, ...value.outcomes },
  };
}

export function createQuestion(text: string, group: VisitQuestion["group"]): VisitQuestion {
  return {
    id: `q-${uid()}`,
    group,
    text,
    status: "open",
    answer: "",
  };
}

export function createTask(label: string, category: VisitQuestion["group"]) {
  return {
    id: `task-${uid()}`,
    label,
    category,
    asked: false,
    answered: false,
    scheduled: false,
    followUp: false,
    note: "",
  };
}
