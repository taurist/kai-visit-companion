import {
  AlertCircle,
  CalendarCheck,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  MessageSquare,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBlankDocument, createQuestion, normalizeDocument } from "./document";
import { readHashConfig } from "./hash";
import { canUseLocalSync, canUseRemoteSync, canUseSync, LocalVisitSyncClient, VisitSyncClient } from "./sync";
import type { SyncClient } from "./sync";
import type { QuestionGroup, QuestionStatus, SyncStatus, VisitDocument } from "./types";
import { questionGroups } from "./types";

type Section = "summary" | "questions" | "pushback" | "growth" | "notes";

type OutcomeKey = keyof VisitDocument["outcomes"];

type BaseProgressItem = {
  id: string;
  label: string;
  group: string;
  complete: boolean;
  reason: string;
};

type ProgressItem =
  | (BaseProgressItem & { kind: "task"; sourceId: string })
  | (BaseProgressItem & { kind: "question"; sourceId: string })
  | (BaseProgressItem & { kind: "outcome"; outcomeKey: OutcomeKey });

const sectionLabels: Array<{ id: Section; label: string }> = [
  { id: "summary", label: "Plan" },
  { id: "questions", label: "Questions" },
  { id: "pushback", label: "Scripts" },
  { id: "growth", label: "Growth" },
  { id: "notes", label: "Notes" },
];

const statusLabels: Record<QuestionStatus, string> = {
  open: "Open",
  asked: "Asked",
  answered: "Answered",
  follow_up: "Follow-up",
};

function getInitialDocument(config: ReturnType<typeof readHashConfig>, storageKey: string): VisitDocument {
  if (config.reset && config.seed) {
    return config.seed;
  }

  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      return normalizeDocument(JSON.parse(stored));
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return config.seed ?? createBlankDocument();
}

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function isTaskTouched(task: VisitDocument["tasks"][number]) {
  return task.asked || task.answered || task.scheduled || task.followUp || hasText(task.note);
}

function isQuestionHandled(question: VisitDocument["questions"][number]) {
  return question.status !== "open" || hasText(question.answer);
}

function getProgressItems(documentState: VisitDocument): ProgressItem[] {
  const taskItems = documentState.tasks.map((task) => ({
    id: `task-${task.id}`,
    kind: "task" as const,
    sourceId: task.id,
    label: task.label,
    group: questionGroups.find((group) => group.id === task.category)?.label ?? "Checklist",
    complete: isTaskTouched(task),
    reason: task.why ?? "This item should be asked, answered, scheduled, or marked for follow-up before you leave.",
  }));

  const questionItems = documentState.questions.map((question) => ({
    id: `question-${question.id}`,
    kind: "question" as const,
    sourceId: question.id,
    label: question.text,
    group: questionGroups.find((group) => group.id === question.group)?.label ?? "Questions",
    complete: isQuestionHandled(question),
    reason: question.why ?? "This question is open until it is asked, answered, or marked as follow-up.",
  }));

  const outcomeItems: ProgressItem[] = [
    {
      id: "outcome-pcv-product",
      kind: "outcome",
      outcomeKey: "pcvProduct",
      label: "Record PCV product",
      group: "Before leaving",
      complete: hasText(documentState.outcomes.pcvProduct),
      reason: "You want the exact PCV product name so the next dose schedule and side-effect context are clear.",
    },
    {
      id: "outcome-rotavirus-product",
      kind: "outcome",
      outcomeKey: "rotavirusProduct",
      label: "Record rotavirus product",
      group: "Before leaving",
      complete: hasText(documentState.outcomes.rotavirusProduct),
      reason: "Rotarix and RotaTeq have different series lengths, so the product name changes the plan.",
    },
    {
      id: "outcome-next-date",
      kind: "outcome",
      outcomeKey: "nextVaccineDate",
      label: "Record next vaccine date",
      group: "Before leaving",
      complete: hasText(documentState.outcomes.nextVaccineDate),
      reason: "A written next date keeps the paced plan from accidentally becoming a long delay.",
    },
    {
      id: "outcome-growth-target",
      kind: "outcome",
      outcomeKey: "growthTarget",
      label: "Record growth target",
      group: "Before leaving",
      complete: hasText(documentState.outcomes.growthTarget),
      reason: "The growth conversation should end with a measurable target and recheck timing, not only reassurance.",
    },
  ];

  return [...taskItems, ...questionItems, ...outcomeItems];
}

function App() {
  const config = useMemo(() => readHashConfig(), []);
  const storageKey = useMemo(() => `visit-companion:${config.roomId ?? "local"}`, [config.roomId]);
  const [documentState, setDocumentState] = useState<VisitDocument>(() => getInitialDocument(config, storageKey));
  const [activeSection, setActiveSection] = useState<Section>("summary");
  const [activeQuestionGroup, setActiveQuestionGroup] = useState<QuestionGroup>("vaccines");
  const [newQuestion, setNewQuestion] = useState("");
  const [newQuestionGroup, setNewQuestionGroup] = useState<QuestionGroup>("vaccines");
  const [showCompletionReview, setShowCompletionReview] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    canUseLocalSync(config)
      ? { mode: "connecting", message: "Connecting local sync" }
      : canUseRemoteSync(config)
        ? { mode: "connecting", message: "Connecting sync" }
        : { mode: "local", message: "Local only" },
  );
  const clientRef = useRef<SyncClient | null>(null);
  const remoteReadyRef = useRef(false);
  const savingRef = useRef(false);
  const documentRef = useRef(documentState);
  const syncEnabled = canUseSync(config);
  const syncPollMs = canUseLocalSync(config) ? 2500 : 5000;

  useEffect(() => {
    documentRef.current = documentState;
  }, [documentState]);

  const saveLocal = useCallback(
    (next: VisitDocument) => {
      localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const updateDocument = useCallback(
    (updater: (current: VisitDocument) => VisitDocument) => {
      setDocumentState((current) => {
        const next = normalizeDocument(updater(current));
        saveLocal(next);
        return next;
      });
    },
    [saveLocal],
  );

  const pullRemote = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    setSyncStatus({ mode: "connecting", message: "Refreshing sync" });
    try {
      const remote = await client.pull();
      if (remote) {
        const normalized = normalizeDocument(remote.document);
        setDocumentState(normalized);
        saveLocal(normalized);
        setSyncStatus({
          mode: "synced",
          message: `Synced ${formatUpdatedAt(remote.updatedAt)}`,
          updatedAt: remote.updatedAt,
        });
      } else {
        const saved = await client.save(documentRef.current);
        setSyncStatus({
          mode: "synced",
          message: `Created room ${formatUpdatedAt(saved.updatedAt)}`,
          updatedAt: saved.updatedAt,
        });
      }
      remoteReadyRef.current = true;
    } catch (error) {
      setSyncStatus({
        mode: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }, [saveLocal]);

  useEffect(() => {
    if (!canUseSync(config)) {
      return;
    }

    clientRef.current = canUseLocalSync(config)
      ? new LocalVisitSyncClient({
          roomId: config.roomId!,
          roomKey: config.roomKey!,
          localSyncUrl: config.localSyncUrl!,
        })
      : new VisitSyncClient({
          roomId: config.roomId!,
          roomKey: config.roomKey!,
          supabaseUrl: config.supabaseUrl!,
          supabaseAnonKey: config.supabaseAnonKey!,
        });
    void pullRemote();
  }, [config, pullRemote]);

  useEffect(() => {
    if (!config.seedUrl || (!config.reset && localStorage.getItem(storageKey))) {
      return;
    }

    let cancelled = false;
    fetch(config.seedUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load seed: ${response.status}`);
        }
        return response.json();
      })
      .then((seed) => {
        if (cancelled) return;
        const normalized = normalizeDocument(seed);
        setDocumentState(normalized);
        saveLocal(normalized);
        if (config.reset) {
          const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          params.delete("reset");
          window.history.replaceState(null, "", `#${params.toString()}`);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setSyncStatus({
          mode: "error",
          message: error instanceof Error ? error.message : "Could not load seed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [config.reset, config.seedUrl, saveLocal, storageKey]);

  useEffect(() => {
    if (!clientRef.current || !remoteReadyRef.current || savingRef.current) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      const client = clientRef.current;
      if (!client) return;

      savingRef.current = true;
      setSyncStatus({ mode: "connecting", message: "Saving" });
      try {
        const saved = await client.save(documentState);
        setSyncStatus({
          mode: "synced",
          message: `Saved ${formatUpdatedAt(saved.updatedAt)}`,
          updatedAt: saved.updatedAt,
        });
      } catch (error) {
        setSyncStatus({
          mode: "error",
          message: error instanceof Error ? error.message : "Save failed",
        });
      } finally {
        savingRef.current = false;
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [documentState]);

  useEffect(() => {
    if (!clientRef.current) return;
    const interval = window.setInterval(() => {
      if (!savingRef.current) {
        void pullRemote();
      }
    }, syncPollMs);
    return () => window.clearInterval(interval);
  }, [pullRemote, syncPollMs]);

  function handleAddQuestion() {
    const text = newQuestion.trim();
    if (!text) return;
    const question = createQuestion(text, newQuestionGroup);
    updateDocument((current) => ({ ...current, questions: [...current.questions, question] }));
    setNewQuestion("");
    setActiveQuestionGroup(newQuestionGroup);
  }

  const visibleQuestions = documentState.questions.filter((question) => question.group === activeQuestionGroup);
  const progressItems = useMemo(() => getProgressItems(documentState), [documentState]);
  const incompleteItems = progressItems.filter((item) => !item.complete);
  const completeCount = progressItems.length - incompleteItems.length;
  const progressPercent = progressItems.length > 0 ? Math.round((completeCount / progressItems.length) * 100) : 100;

  return (
    <main className="app-shell">
      <header className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">{documentState.profile.dateLabel}</p>
          <h1>{documentState.profile.childLabel}</h1>
          <p>{documentState.profile.summary}</p>
        </div>
        <SyncBadge status={syncStatus} onRefresh={() => void pullRemote()} canRefresh={syncEnabled} />
      </header>

      <section className="sticky-summary" aria-label="Appointment summary">
        <SummaryColumn title="Today" items={documentState.summary.today} tone="green" />
        <SummaryColumn title="Deferred" items={documentState.summary.deferred} tone="amber" />
        <SummaryColumn title="Schedule" items={documentState.summary.schedule} tone="blue" />
        <SummaryColumn title="Before leaving" items={documentState.summary.beforeLeaving} tone="red" />
      </section>

      <section className="progress-dock" aria-label="Visit progress">
        <div className="progress-card">
          <div className="progress-topline">
            <div>
              <p className="progress-kicker">Visit progress</p>
              <h2>{progressPercent}% complete</h2>
            </div>
            <button
              className="complete-visit-button"
              type="button"
              onClick={() => setShowCompletionReview((current) => !current)}
            >
              <ListChecks aria-hidden="true" />
              Complete Visit
            </button>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="progress-caption">
            {incompleteItems.length === 0
              ? "All required visit items are captured."
              : `${incompleteItems.length} item${incompleteItems.length === 1 ? "" : "s"} still open before leaving.`}
          </p>
          {showCompletionReview && (
            <CompletionReview
              progressItems={progressItems}
              incompleteItems={incompleteItems}
              documentState={documentState}
              updateDocument={updateDocument}
              onOpenQuestions={() => {
                setActiveSection("questions");
                setShowCompletionReview(false);
              }}
              onOpenGrowth={() => {
                setActiveSection("growth");
                setShowCompletionReview(false);
              }}
            />
          )}
        </div>
      </section>

      <nav className="section-tabs" aria-label="Dashboard sections">
        {sectionLabels.map((section) => (
          <button
            key={section.id}
            className={activeSection === section.id ? "active" : ""}
            type="button"
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {activeSection === "summary" && (
        <section className="content-flow" aria-label="Plan and checklist">
          <div className="section-heading">
            <Shield aria-hidden="true" />
            <div>
              <h2>Vaccine Plan</h2>
              <p>Plain answers ready for the room.</p>
            </div>
          </div>

          <div className="decision-grid">
            {documentState.decisions.map((decision) => (
              <article className={`decision-card ${decision.kind}`} key={decision.id}>
                <div>
                  <p className="decision-kicker">{decision.stance}</p>
                  <h3>{decision.title}</h3>
                </div>
                <dl>
                  {decision.why && (
                    <div>
                      <dt>Why this is here</dt>
                      <dd>
                        <Explanation text={decision.why} />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Reason</dt>
                    <dd>{decision.reason}</dd>
                  </div>
                  <div>
                    <dt>Timing</dt>
                    <dd>{decision.timing}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>{decision.deadline}</dd>
                  </div>
                  <div>
                    <dt>Pushback reply</dt>
                    <dd>{decision.pushback}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <ClipboardList aria-hidden="true" />
            <div>
              <h2>Room Checklist</h2>
              <p>Mark what happened while the conversation is fresh.</p>
            </div>
          </div>

          <div className="task-list">
            {documentState.tasks.map((task) => (
              <article className="task-row" key={task.id}>
                <div className="task-main">
                  <span>{task.label}</span>
                  <small>{questionGroups.find((group) => group.id === task.category)?.label}</small>
                  {task.why && <Explanation text={task.why} />}
                </div>
                <div className="task-actions">
                  <TogglePill
                    active={task.asked}
                    label="Asked"
                    onClick={() =>
                      updateDocument((current) => ({
                        ...current,
                        tasks: current.tasks.map((item) =>
                          item.id === task.id ? { ...item, asked: !item.asked } : item,
                        ),
                      }))
                    }
                  />
                  <TogglePill
                    active={task.answered}
                    label="Answered"
                    onClick={() =>
                      updateDocument((current) => ({
                        ...current,
                        tasks: current.tasks.map((item) =>
                          item.id === task.id ? { ...item, answered: !item.answered } : item,
                        ),
                      }))
                    }
                  />
                  <TogglePill
                    active={task.scheduled}
                    label="Scheduled"
                    onClick={() =>
                      updateDocument((current) => ({
                        ...current,
                        tasks: current.tasks.map((item) =>
                          item.id === task.id ? { ...item, scheduled: !item.scheduled } : item,
                        ),
                      }))
                    }
                  />
                  <TogglePill
                    active={task.followUp}
                    label="Follow-up"
                    onClick={() =>
                      updateDocument((current) => ({
                        ...current,
                        tasks: current.tasks.map((item) =>
                          item.id === task.id ? { ...item, followUp: !item.followUp } : item,
                        ),
                      }))
                    }
                  />
                </div>
                <textarea
                  aria-label={`Notes for ${task.label}`}
                  placeholder="Answer or follow-up note"
                  value={task.note}
                  onChange={(event) =>
                    updateDocument((current) => ({
                      ...current,
                      tasks: current.tasks.map((item) =>
                        item.id === task.id ? { ...item, note: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {activeSection === "questions" && (
        <section className="content-flow" aria-label="Questions">
          <div className="section-heading">
            <MessageSquare aria-hidden="true" />
            <div>
              <h2>Questions</h2>
              <p>Add, ask, answer, and flag follow-ups.</p>
            </div>
          </div>

          <div className="add-question">
            <select
              aria-label="Question group"
              value={newQuestionGroup}
              onChange={(event) => setNewQuestionGroup(event.target.value as QuestionGroup)}
            >
              {questionGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
            <input
              aria-label="New question"
              value={newQuestion}
              placeholder="Add a question"
              onChange={(event) => setNewQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddQuestion();
              }}
            />
            <button className="icon-button primary" type="button" onClick={handleAddQuestion} aria-label="Add question">
              <Plus aria-hidden="true" />
            </button>
          </div>

          <div className="group-tabs" aria-label="Question groups">
            {questionGroups.map((group) => (
              <button
                key={group.id}
                className={activeQuestionGroup === group.id ? "active" : ""}
                type="button"
                onClick={() => setActiveQuestionGroup(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="question-list">
            {visibleQuestions.map((question) => (
              <article className="question-row" key={question.id}>
                <div className="question-topline">
                  <p>{question.text}</p>
                  <button
                    className="icon-button ghost"
                    type="button"
                    aria-label="Delete question"
                    onClick={() =>
                      updateDocument((current) => ({
                        ...current,
                        questions: current.questions.filter((item) => item.id !== question.id),
                      }))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
                {question.why && <Explanation text={question.why} />}
                <div className="status-row">
                  {(Object.keys(statusLabels) as QuestionStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={question.status === status ? "status active" : "status"}
                      onClick={() =>
                        updateDocument((current) => ({
                          ...current,
                          questions: current.questions.map((item) =>
                            item.id === question.id ? { ...item, status } : item,
                          ),
                        }))
                      }
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
                <textarea
                  aria-label={`Answer for ${question.text}`}
                  placeholder="Answer, concern, or follow-up"
                  value={question.answer}
                  onChange={(event) =>
                    updateDocument((current) => ({
                      ...current,
                      questions: current.questions.map((item) =>
                        item.id === question.id ? { ...item, answer: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {activeSection === "pushback" && (
        <section className="content-flow" aria-label="Pushback scripts">
          <div className="section-heading">
            <AlertCircle aria-hidden="true" />
            <div>
              <h2>Pushback Scripts</h2>
              <p>Short replies that keep the visit grounded.</p>
            </div>
          </div>
          <div className="script-list">
            {documentState.scripts.map((script) => (
              <article className="script-row" key={script.id}>
                <h3>{script.prompt}</h3>
                {script.why && <Explanation text={script.why} />}
                <p>{script.reply}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeSection === "growth" && (
        <section className="content-flow" aria-label="Growth and development">
          <div className="section-heading">
            <CalendarCheck aria-hidden="true" />
            <div>
              <h2>Growth Plan</h2>
              <p>Leave with data, thresholds, and next steps.</p>
            </div>
          </div>
          <div className="outcome-grid">
            <Field
              label="PCV product"
              value={documentState.outcomes.pcvProduct}
              onChange={(pcvProduct) =>
                updateDocument((current) => ({ ...current, outcomes: { ...current.outcomes, pcvProduct } }))
              }
            />
            <Field
              label="Rotavirus product"
              value={documentState.outcomes.rotavirusProduct}
              onChange={(rotavirusProduct) =>
                updateDocument((current) => ({ ...current, outcomes: { ...current.outcomes, rotavirusProduct } }))
              }
            />
            <Field
              label="Next vaccine date"
              value={documentState.outcomes.nextVaccineDate}
              onChange={(nextVaccineDate) =>
                updateDocument((current) => ({ ...current, outcomes: { ...current.outcomes, nextVaccineDate } }))
              }
            />
            <Field
              label="Growth target"
              value={documentState.outcomes.growthTarget}
              onChange={(growthTarget) =>
                updateDocument((current) => ({ ...current, outcomes: { ...current.outcomes, growthTarget } }))
              }
            />
            <Field
              label="Referrals"
              value={documentState.outcomes.referrals}
              onChange={(referrals) =>
                updateDocument((current) => ({ ...current, outcomes: { ...current.outcomes, referrals } }))
              }
            />
          </div>
        </section>
      )}

      {activeSection === "notes" && (
        <section className="content-flow" aria-label="Visit notes">
          <div className="section-heading">
            <ClipboardList aria-hidden="true" />
            <div>
              <h2>Visit Notes</h2>
              <p>Keep the decisions in one place.</p>
            </div>
          </div>
          <textarea
            className="notes-box"
            aria-label="Visit notes"
            value={documentState.notes}
            placeholder="What was decided? What needs follow-up?"
            onChange={(event) => updateDocument((current) => ({ ...current, notes: event.target.value }))}
          />
          <SyncSetup />
        </section>
      )}
    </main>
  );
}

function SyncBadge({
  status,
  canRefresh,
  onRefresh,
}: {
  status: SyncStatus;
  canRefresh: boolean;
  onRefresh: () => void;
}) {
  const Icon = status.mode === "synced" ? Wifi : status.mode === "local" ? WifiOff : RefreshCw;
  return (
    <div className={`sync-badge ${status.mode}`}>
      <Icon aria-hidden="true" />
      <span>{status.message}</span>
      {canRefresh && (
        <button className="icon-button ghost" type="button" onClick={onRefresh} aria-label="Refresh sync">
          <RefreshCw aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function SummaryColumn({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <article className={`summary-column ${tone}`}>
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None</p>
      )}
    </article>
  );
}

function CompletionReview({
  progressItems,
  incompleteItems,
  documentState,
  updateDocument,
  onOpenQuestions,
  onOpenGrowth,
}: {
  progressItems: ProgressItem[];
  incompleteItems: ProgressItem[];
  documentState: VisitDocument;
  updateDocument: (updater: (current: VisitDocument) => VisitDocument) => void;
  onOpenQuestions: () => void;
  onOpenGrowth: () => void;
}) {
  const sortedItems = [...progressItems].sort((first, second) => Number(first.complete) - Number(second.complete));

  return (
    <div className="completion-review">
      <div className="completion-heading">
        <h3>{incompleteItems.length === 0 ? "Ready to leave" : "Still open"}</h3>
        <p>
          {incompleteItems.length === 0
            ? "The key questions, outcomes, and checklist items are captured."
            : "Use this as the final sweep before ending the appointment."}
        </p>
      </div>
      {progressItems.length > 0 && (
        <ul className="completion-list">
          {sortedItems.map((item) => (
            <li className={item.complete ? "complete" : "open"} key={item.id}>
              <div>
                <span>
                  {item.group} · {item.complete ? "Done" : "Open"}
                </span>
                <strong>{item.label}</strong>
              </div>
              <Explanation text={item.reason} />
              <CompletionEditor item={item} documentState={documentState} updateDocument={updateDocument} />
            </li>
          ))}
        </ul>
      )}
      <div className="completion-actions">
        <button type="button" onClick={onOpenQuestions}>
          Open Questions
        </button>
        <button type="button" onClick={onOpenGrowth}>
          Open Growth
        </button>
      </div>
    </div>
  );
}

function CompletionEditor({
  item,
  documentState,
  updateDocument,
}: {
  item: ProgressItem;
  documentState: VisitDocument;
  updateDocument: (updater: (current: VisitDocument) => VisitDocument) => void;
}) {
  if (item.kind === "task") {
    const task = documentState.tasks.find((candidate) => candidate.id === item.sourceId);
    if (!task) return null;

    return (
      <div className="completion-editor">
        <div className="task-actions compact">
          <TogglePill
            active={task.asked}
            label="Asked"
            onClick={() =>
              updateDocument((current) => ({
                ...current,
                tasks: current.tasks.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, asked: !candidate.asked } : candidate,
                ),
              }))
            }
          />
          <TogglePill
            active={task.answered}
            label="Answered"
            onClick={() =>
              updateDocument((current) => ({
                ...current,
                tasks: current.tasks.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, answered: !candidate.answered } : candidate,
                ),
              }))
            }
          />
          <TogglePill
            active={task.scheduled}
            label="Scheduled"
            onClick={() =>
              updateDocument((current) => ({
                ...current,
                tasks: current.tasks.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, scheduled: !candidate.scheduled } : candidate,
                ),
              }))
            }
          />
          <TogglePill
            active={task.followUp}
            label="Follow-up"
            onClick={() =>
              updateDocument((current) => ({
                ...current,
                tasks: current.tasks.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, followUp: !candidate.followUp } : candidate,
                ),
              }))
            }
          />
        </div>
        <textarea
          aria-label={`Completion note for ${task.label}`}
          placeholder="Answer or follow-up note"
          value={task.note}
          onChange={(event) =>
            updateDocument((current) => ({
              ...current,
              tasks: current.tasks.map((candidate) =>
                candidate.id === task.id ? { ...candidate, note: event.target.value } : candidate,
              ),
            }))
          }
        />
      </div>
    );
  }

  if (item.kind === "question") {
    const question = documentState.questions.find((candidate) => candidate.id === item.sourceId);
    if (!question) return null;

    return (
      <div className="completion-editor">
        <div className="status-row compact">
          {(Object.keys(statusLabels) as QuestionStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              className={question.status === status ? "status active" : "status"}
              onClick={() =>
                updateDocument((current) => ({
                  ...current,
                  questions: current.questions.map((candidate) =>
                    candidate.id === question.id ? { ...candidate, status } : candidate,
                  ),
                }))
              }
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
        <textarea
          aria-label={`Completion answer for ${question.text}`}
          placeholder="Answer, concern, or follow-up"
          value={question.answer}
          onChange={(event) =>
            updateDocument((current) => ({
              ...current,
              questions: current.questions.map((candidate) =>
                candidate.id === question.id ? { ...candidate, answer: event.target.value } : candidate,
              ),
            }))
          }
        />
      </div>
    );
  }

  const outcomeLabels: Record<OutcomeKey, string> = {
    pcvProduct: "PCV product",
    rotavirusProduct: "Rotavirus product",
    nextVaccineDate: "Next vaccine date",
    growthTarget: "Growth target",
    referrals: "Referrals",
  };

  return (
    <label className="completion-field">
      <span>{outcomeLabels[item.outcomeKey]}</span>
      <input
        value={documentState.outcomes[item.outcomeKey]}
        onChange={(event) =>
          updateDocument((current) => ({
            ...current,
            outcomes: { ...current.outcomes, [item.outcomeKey]: event.target.value },
          }))
        }
      />
    </label>
  );
}

function Explanation({ text }: { text: string }) {
  return (
    <details className="explanation">
      <summary>
        <ChevronDown aria-hidden="true" />
        Why this is here
      </summary>
      <p>{text}</p>
    </details>
  );
}

function TogglePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "toggle-pill active" : "toggle-pill"} type="button" onClick={onClick}>
      {active ? <CheckCircle2 aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SyncSetup() {
  const [supabaseUrl, setSupabaseUrl] = useState(localStorage.getItem("visit-companion:supabase-url") ?? "");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(localStorage.getItem("visit-companion:supabase-anon-key") ?? "");

  return (
    <section className="sync-setup" aria-label="Sync setup">
      <h2>Sync Settings</h2>
      <p>Shared sync needs a Supabase URL, anon key, room, and key in the link fragment.</p>
      <label>
        <span>Supabase URL</span>
        <input value={supabaseUrl} onChange={(event) => setSupabaseUrl(event.target.value)} />
      </label>
      <label>
        <span>Supabase anon key</span>
        <input value={supabaseAnonKey} onChange={(event) => setSupabaseAnonKey(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("visit-companion:supabase-url", supabaseUrl.trim());
          localStorage.setItem("visit-companion:supabase-anon-key", supabaseAnonKey.trim());
          window.location.reload();
        }}
      >
        Save sync settings
      </button>
    </section>
  );
}

export default App;
