"use client";

import { Check, Loader2, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "running" | "done";

type Phase =
  | "idle"
  | "draft"
  | "waitHuman"
  | "slackApproval"
  | "buttonPress"
  | "modalOpen"
  | "modalEditSubject"
  | "modalEditBody"
  | "modalConfirm"
  | "isResolved"
  | "sendEmail"
  | "gmail"
  | "notify"
  | "done"
  | "pause";

const STEP_COUNT = 5;

/** Total loop duration in ms — scale all phase timings from this single knob. */
export const HERO_DEMO_DURATION_MS = 18_000;

const BASE_PHASE_WEIGHTS: Record<Phase, number> = {
  idle: 300,
  draft: 700,
  waitHuman: 900,
  slackApproval: 600,
  buttonPress: 400,
  modalOpen: 500,
  modalEditSubject: 1000,
  modalEditBody: 1400,
  modalConfirm: 500,
  isResolved: 700,
  sendEmail: 700,
  gmail: 800,
  notify: 700,
  done: 1200,
  pause: 2500,
};

const BASE_DURATION_MS = Object.values(BASE_PHASE_WEIGHTS).reduce(
  (sum, ms) => sum + ms,
  0,
);

function buildPhaseTiming(durationMs: number): Record<Phase, number> {
  const scale = durationMs / BASE_DURATION_MS;
  return Object.fromEntries(
    Object.entries(BASE_PHASE_WEIGHTS).map(([phase, weight]) => [
      phase,
      Math.round(weight * scale),
    ]),
  ) as Record<Phase, number>;
}

const PHASE_ORDER: Phase[] = [
  "idle",
  "draft",
  "waitHuman",
  "slackApproval",
  "buttonPress",
  "modalOpen",
  "modalEditSubject",
  "modalEditBody",
  "modalConfirm",
  "isResolved",
  "sendEmail",
  "gmail",
  "notify",
  "done",
  "pause",
];

const DEMO_USER_EMAIL = "user@acme.com";
const APPROVAL_MESSAGE = `Draft email to ${DEMO_USER_EMAIL} ready for your review.`;

const EMAIL_SUBJECT_DRAFT = "Quick follow-up";
const EMAIL_SUBJECT = "Welcome — let's connect";
const EMAIL_BODY_DRAFT = "Hi there, thanks for reaching out.";
const EMAIL_BODY =
  "Hi there, thanks for reaching out. I'd love to schedule a quick call next week.";

type CodeLine = {
  step: number;
  indent?: number;
  parts: { text: string; className?: string }[];
};

const CODE_LINES: CodeLine[] = [
  {
    step: 0,
    parts: [
      { text: "const", className: "text-violet-400" },
      { text: " draft = " },
      { text: "await", className: "text-violet-400" },
      { text: " emailDraftWriter({ email: user.email });" },
    ],
  },
  {
    step: 1,
    parts: [
      { text: "const", className: "text-violet-400" },
      { text: " approval = " },
      { text: "await", className: "text-violet-400" },
      { text: " " },
      { text: "waitForHuman", className: "inline-block rounded-sm bg-sky-400/25 px-1 py-0.5 font-bold text-sky-100" },
      { text: "({" },
    ],
  },
  {
    step: 1,
    indent: 1,
    parts: [
      { text: "message", className: "text-sky-300" },
      { text: ": `" },
      { text: "Draft email to " },
      { text: "${user.email}", className: "text-amber-300" },
      { text: " ready for your review.`," },
    ],
  },
  {
    step: 1,
    indent: 1,
    parts: [
      { text: "actions", className: "text-sky-300" },
      { text: ": actions()" },
    ],
  },
  {
    step: 1,
    indent: 2,
    parts: [
      { text: ".approve", className: "text-amber-300" },
      { text: "({ fields: { subject, body } })" },
    ],
  },
  {
    step: 1,
    indent: 2,
    parts: [
      { text: ".deny", className: "text-amber-300" },
      { text: "()" },
    ],
  },
  {
    step: 1,
    indent: 2,
    parts: [
      { text: ".build", className: "text-amber-300" },
      { text: "()," },
    ],
  },
  {
    step: 1,
    indent: 1,
    parts: [{ text: "});" }],
  },
  {
    step: 2,
    parts: [
      { text: "if", className: "text-violet-400" },
      { text: " (!" },
      { text: "isResolved", className: "text-amber-300" },
      { text: '(approval, "approve")) ' },
      { text: "return", className: "text-violet-400" },
      { text: ";" },
    ],
  },
  {
    step: 3,
    parts: [
      { text: "await", className: "text-violet-400" },
      { text: " sendEmail({ email: user.email, ...approval.feedbacks });" },
    ],
  },
  {
    step: 4,
    parts: [
      { text: "await", className: "text-violet-400" },
      { text: " notify({ message: " },
      { text: '"Done!"', className: "text-emerald-400" },
      { text: " });" },
    ],
  },
];

function stepStatusesForPhase(phase: Phase): StepStatus[] {
  const statuses: StepStatus[] = Array(STEP_COUNT).fill("pending");

  switch (phase) {
    case "idle":
      break;
    case "draft":
      statuses[0] = "running";
      break;
    case "waitHuman":
    case "slackApproval":
    case "buttonPress":
    case "modalOpen":
    case "modalEditSubject":
    case "modalEditBody":
    case "modalConfirm":
      statuses[0] = "done";
      statuses[1] = "running";
      break;
    case "isResolved":
      statuses[0] = "done";
      statuses[1] = "done";
      statuses[2] = "running";
      break;
    case "sendEmail":
      statuses[0] = "done";
      statuses[1] = "done";
      statuses[2] = "done";
      statuses[3] = "running";
      break;
    case "gmail":
      statuses[0] = "done";
      statuses[1] = "done";
      statuses[2] = "done";
      statuses[3] = "done";
      break;
    case "notify":
    case "done":
    case "pause":
      statuses[0] = "done";
      statuses[1] = "done";
      statuses[2] = "done";
      statuses[3] = "done";
      statuses[4] = phase === "notify" ? "running" : "done";
      break;
  }

  return statuses;
}

function StepIcon({ status }: { status: StepStatus }) {
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
      {status === "running" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
      ) : status === "done" ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
      )}
    </span>
  );
}

function CodePanel({ stepStatuses }: { stepStatuses: StepStatus[] }) {
  const activeStep = stepStatuses.findIndex((s) => s === "running");

  return (
    <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden border-r border-black/5 dark:border-white/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="font-mono text-xs text-zinc-400">workflow.ts</span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden p-3 font-mono text-[11px] leading-none sm:text-xs">
        {CODE_LINES.map((line, i) => {
          const lineStatus = stepStatuses[line.step] ?? "pending";
          const isActive = line.step === activeStep;
          const showStepIcon =
            i === 0 || CODE_LINES[i - 1]?.step !== line.step;

          return (
            <div
              key={i}
              className={cn(
                "flex h-[1.375rem] min-w-0 items-center gap-2 rounded-sm px-1",
                isActive && lineStatus === "running" && "bg-brand/10",
                lineStatus === "done" && "opacity-80",
              )}
            >
              <span className="w-3.5 shrink-0">
                {showStepIcon ? <StepIcon status={lineStatus} /> : null}
              </span>
              <span
                className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-zinc-300"
                style={{ paddingLeft: `${(line.indent ?? 0) * 1.25}rem` }}
              >
                {line.parts.map((part, j) => (
                  <span key={j} className={part.className}>
                    {part.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useEditText(
  draft: string,
  target: string,
  active: boolean,
  reducedMotion: boolean,
  msPerChar: number,
) {
  const [text, setText] = useState(draft);

  useEffect(() => {
    if (!active) {
      setText(draft);
      return;
    }

    if (reducedMotion) {
      setText(target);
      return;
    }

    setText(draft);
    let deleting = true;
    let deleteIndex = draft.length;
    let typeIndex = 0;

    const timer = setInterval(() => {
      if (deleting) {
        deleteIndex -= 1;
        setText(draft.slice(0, deleteIndex));
        if (deleteIndex <= 0) deleting = false;
        return;
      }

      typeIndex += 1;
      setText(target.slice(0, typeIndex));
      if (typeIndex >= target.length) clearInterval(timer);
    }, msPerChar);

    return () => clearInterval(timer);
  }, [active, draft, target, reducedMotion, msPerChar]);

  return text;
}

function TypingCursor({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="ml-px inline-block h-3.5 w-0.5 animate-pulse bg-brand align-middle" />
  );
}

function ModalField({
  label,
  value,
  isEditing,
  showCursor,
  multiline,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  showCursor: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-zinc-500">{label}</label>
      <div
        className={cn(
          "mt-0.5 rounded-md border bg-white px-2.5 py-1.5 text-xs text-zinc-800 transition-colors",
          isEditing
            ? "border-brand ring-2 ring-brand/20"
            : "border-zinc-200",
          multiline ? "min-h-[3.25rem] leading-snug" : "truncate",
        )}
      >
        {value}
        <TypingCursor visible={showCursor} />
      </div>
    </div>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z"
      />
      <path
        fill="#E01E5A"
        d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.527 2.527 0 0 1 2.521 2.522v2.52H8.834z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 6.313a2.527 2.527 0 0 1 2.521 2.521 2.527 2.527 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.527 2.527 0 0 1-2.522 2.521h-2.522V8.834z"
      />
      <path
        fill="#2EB67D"
        d="M17.688 8.834a2.527 2.527 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.523-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.523-2.522v-2.522h2.523z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 17.688a2.527 2.527 0 0 1-2.523-2.523 2.527 2.527 0 0 1 2.523-2.523h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
      />
    </svg>
  );
}

function ChannelPanel({
  phase,
  reducedMotion,
}: {
  phase: Phase;
  reducedMotion: boolean;
}) {
  const subjectTyping = useEditText(
    EMAIL_SUBJECT_DRAFT,
    EMAIL_SUBJECT,
    phase === "modalEditSubject",
    reducedMotion,
    38,
  );
  const bodyTyping = useEditText(
    EMAIL_BODY_DRAFT,
    EMAIL_BODY,
    phase === "modalEditBody",
    reducedMotion,
    20,
  );

  const showApproval =
    phase !== "idle" &&
    phase !== "draft" &&
    phase !== "waitHuman";
  const showButtons =
    phase === "slackApproval" ||
    phase === "buttonPress" ||
    phase === "modalOpen" ||
    phase === "modalEditSubject" ||
    phase === "modalEditBody" ||
    phase === "modalConfirm";
  const buttonPressed =
    phase === "buttonPress" ||
    phase === "modalOpen" ||
    phase === "modalEditSubject" ||
    phase === "modalEditBody" ||
    phase === "modalConfirm";
  const showModal =
    phase === "modalOpen" ||
    phase === "modalEditSubject" ||
    phase === "modalEditBody" ||
    phase === "modalConfirm" ||
    (phase === "isResolved" && reducedMotion);
  const modalConfirmed =
    phase === "modalConfirm" ||
    phase === "isResolved" ||
    phase === "sendEmail" ||
    phase === "gmail" ||
    phase === "notify" ||
    phase === "done" ||
    phase === "pause";
  const showGmail =
    phase === "gmail" ||
    phase === "notify" ||
    phase === "done" ||
    phase === "pause";
  const showDone = phase === "done" || phase === "pause";

  const subjectValue = (() => {
    if (phase === "modalOpen") return EMAIL_SUBJECT_DRAFT;
    if (phase === "modalEditSubject") return subjectTyping;
    if (
      phase === "modalEditBody" ||
      phase === "modalConfirm" ||
      modalConfirmed ||
      showGmail ||
      showDone
    ) {
      return EMAIL_SUBJECT;
    }
    return EMAIL_SUBJECT_DRAFT;
  })();

  const bodyValue = (() => {
    if (phase === "modalOpen" || phase === "modalEditSubject") {
      return EMAIL_BODY_DRAFT;
    }
    if (phase === "modalEditBody") return bodyTyping;
    if (
      phase === "modalConfirm" ||
      modalConfirmed ||
      showGmail ||
      showDone
    ) {
      return EMAIL_BODY;
    }
    return EMAIL_BODY_DRAFT;
  })();

  const editingSubject = phase === "modalEditSubject";
  const editingBody = phase === "modalEditBody";

  return (
    <div className="relative flex min-h-[360px] min-w-0 flex-col overflow-hidden bg-[#1a1d21]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <SlackIcon />
        <span className="font-mono text-xs text-zinc-300">#general</span>
      </div>

      <div className="relative flex-1 space-y-3 overflow-hidden p-4">
        {showApproval && (
          <div
            className={cn(
              "hero-demo-fade-in flex gap-2.5",
              reducedMotion && "opacity-100",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
              H
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-xs font-semibold text-zinc-200">
                hitl-bot
              </div>
              <div className="py-1 text-sm text-zinc-200">
                {APPROVAL_MESSAGE}
              </div>
              {showButtons && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "rounded bg-[#007a5a] px-3 py-1 text-xs font-medium text-white transition-all duration-200",
                      buttonPressed && "scale-95 ring-2 ring-white/40",
                    )}
                  >
                    Review and send
                  </span>
                  <span className="rounded border border-white/20 px-3 py-1 text-xs text-zinc-300">
                    Deny
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {showGmail && (
          <div className="hero-demo-slide-up rounded-lg border border-white/10 bg-white p-3 text-zinc-900 shadow-lg">
            <div className="mb-2 flex items-center gap-2 border-b border-zinc-100 pb-2">
              <Mail className="h-4 w-4 text-[#EA4335]" />
              <span className="text-xs font-medium text-zinc-600">Gmail Inbox</span>
            </div>
            <div className="flex items-start gap-2 rounded bg-blue-50 px-2 py-1.5">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">you@company.com</div>
                <div className="truncate text-xs font-medium">{EMAIL_SUBJECT}</div>
                <div className="truncate text-[10px] text-zinc-500">{EMAIL_BODY}</div>
              </div>
            </div>
          </div>
        )}

        {showDone && (
          <div className="hero-demo-fade-in flex gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
              H
            </div>
            <div>
              <div className="mb-0.5 text-xs font-semibold text-zinc-200">
                hitl-bot
              </div>
              <div className="py-1 text-sm text-zinc-200">
                Done!
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-3">
            <div
              className={cn(
                "hero-demo-fade-in w-full max-w-[252px] rounded-lg bg-white p-4 shadow-2xl sm:max-w-[288px]",
                modalConfirmed && "opacity-95",
              )}
            >
              <div className="mb-3 text-sm font-semibold text-zinc-900">
                Review email
              </div>
              <div className="space-y-2">
                <ModalField
                  label="Subject"
                  value={subjectValue}
                  isEditing={editingSubject}
                  showCursor={
                    editingSubject &&
                    subjectTyping !== EMAIL_SUBJECT
                  }
                />
                <ModalField
                  label="Body"
                  value={bodyValue}
                  isEditing={editingBody}
                  showCursor={
                    editingBody && bodyTyping !== EMAIL_BODY
                  }
                  multiline
                />
              </div>
              <div
                className={cn(
                  "mt-3 rounded-md bg-[#007a5a] py-2 text-center text-xs font-medium text-white transition-all duration-200",
                  modalConfirmed && "scale-95 ring-2 ring-[#007a5a]/40",
                  (editingSubject || editingBody) && "opacity-60",
                )}
              >
                Confirm
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function nextPhase(phase: Phase): Phase {
  const index = PHASE_ORDER.indexOf(phase);
  if (index === PHASE_ORDER.length - 1) return "idle";
  return PHASE_ORDER[index + 1]!;
}

export function HeroDemo({
  durationMs = HERO_DEMO_DURATION_MS,
}: {
  durationMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const phaseTiming = useMemo(
    () => buildPhaseTiming(durationMs),
    [durationMs],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPhase("done");
      return;
    }

    const delay = phaseTiming[phase];
    const timer = setTimeout(() => {
      setPhase((p) => (p === "pause" ? "idle" : nextPhase(p)));
    }, delay);

    return () => clearTimeout(timer);
  }, [phase, reducedMotion, phaseTiming]);

  const stepStatuses = stepStatusesForPhase(phase);

  return (
    <div
      aria-hidden="true"
      className="w-full min-w-0 max-w-5xl overflow-hidden rounded-lg border border-black/5 bg-zinc-950 shadow-xl shadow-black/20 dark:border-white/10"
    >
      <div className="grid min-w-0 grid-cols-1 md:grid-cols-2">
        <CodePanel stepStatuses={stepStatuses} />
        <ChannelPanel phase={phase} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
