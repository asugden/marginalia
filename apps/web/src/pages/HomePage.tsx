// Student course home — a single scrolling STACK of the course's enabled
// modules, each in the shared ModulePanel frame so they read as peers. Agents
// is the always-present core; Writing (provenance) is always shown; Attendance
// appears only when the course turned it on. The topbar module nav scrolls the
// matching panel into view (via a `#module` hash this page reads) — which is
// why no module needs a per-screen back button. The shell (StudentLayout) owns
// the topbar + chrome; this page renders the heading lockup and the module
// stack.
//
// Presentation follows the design-system app kit: an eyebrow→heading lockup,
// then `app-modstack` of `app-modpanel`s. Course id / name / flags come from
// useCourse() (the shell validated enrollment). The worker-injected bootstrap
// still seeds the first paint with agent rows when present.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { listAgents, type AgentSummary } from "../client.js";
import {
  createDocument,
  listDocuments,
  type DocumentSummary,
} from "../modules/provenance/api.js";
import { useCourse } from "../course/useCourse.js";
import { logPerf, readBootstrap } from "../bootstrap.js";
import { ArrowIcon, DocIcon, PencilIcon, PlusIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, IconButton } from "../components/index.js";

export function HomePage() {
  const { courseId, courseName, role, provenanceEnabled } = useCourse();
  const location = useLocation();
  const navigate = useNavigate();
  const base = `/course/${courseId}`;
  // Instructor viewing their own course is "preview as student".
  const scoped = role === "instructor";
  // When previewing, editor links carry ?preview=1 so the standalone editor
  // (which can't read this context) knows to replicate the student view —
  // including hiding provenance marks. See EditorPage.
  const editorSuffix = scoped ? "?preview=1" : "";

  // v0.7 §2 / v1.0 §7.1 — consume the worker-injected bootstrap *synchronously*
  // in the useState initializer so the very first render already has rows.
  const initialBoot = (() => {
    const boot = readBootstrap();
    return boot && boot.kind === "agents" && boot.courseId === courseId
      ? boot
      : null;
  })();
  const [agents, setAgents] = useState<AgentSummary[] | null>(
    initialBoot?.agents ?? null,
  );
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);

  useEffect(() => {
    const fresh =
      initialBoot &&
      typeof window.__BOOTSTRAP_AT__ === "number" &&
      Date.now() - window.__BOOTSTRAP_AT__ < 30_000;
    if (initialBoot) {
      logPerf("agents-from-bootstrap", { count: initialBoot.agents.length });
    }
    if (initialBoot && fresh) return;
    const fetchStart = performance.now();
    listAgents(courseId)
      .then((r) => {
        setAgents(r.agents);
        logPerf("agents-from-network", {
          count: r.agents.length,
          ms: Math.round(performance.now() - fetchStart),
        });
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "Load failed";
        if (/redirecting to sign-in/i.test(message)) {
          // jsonFetch is already bouncing through /auth/login; don't flash.
        } else {
          setError(message);
        }
      });
  }, [courseId, initialBoot]);

  // Writing module data. Best-effort: a failed load leaves the panel empty
  // rather than blocking the whole home.
  useEffect(() => {
    const ctrl = new AbortController();
    listDocuments(courseId, ctrl.signal)
      .then((d) => setDocs(d))
      .catch(() => {
        if (!ctrl.signal.aborted) setDocs([]);
      });
    return () => ctrl.abort();
  }, [courseId]);

  // Scroll the module panel named by the URL hash to the top of the scrolling
  // body when the topbar nav asks for it. Re-fires whenever the hash (with its
  // trailing nonce) changes, even for the same module. Agents is the home
  // module — land at the very top so the course header shows.
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    const id = location.hash.replace(/^#/, "").split("-")[0];
    if (!id) return;
    const el = panelRefs.current[id];
    if (!el) return;
    const scroller = el.closest(".app__body");
    if (!scroller) return;
    const top = id === "agents" ? 0 : Math.max(0, el.offsetTop - 12);
    // Instant jump — a smooth scroll kicked off during the same render that
    // carried the hash change gets cancelled and never moves.
    scroller.scrollTo({ top, behavior: "auto" });
  }, [location.hash, agents, docs]);

  const setRef = (id: string) => (n: HTMLElement | null) => {
    panelRefs.current[id] = n;
  };

  const inProgress =
    agents?.filter((a) => a.lastConversationId !== null && a.lastCompletedAt === null)
      .length ?? 0;
  const done =
    agents?.filter((a) => a.hasBackbone && a.lastCompletedAt !== null).length ?? 0;

  async function onNewDocument() {
    if (creatingDoc) return;
    setCreatingDoc(true);
    try {
      const doc = await createDocument(courseId);
      navigate(`${base}/write/${doc.id}${editorSuffix}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a document");
      setCreatingDoc(false);
    }
  }

  return (
    <div className="app-home__inner">
      <div className="app-head">
        <span className="eyebrow">
          {scoped ? "Course preview" : courseName || "Course"}
        </span>
        <span className="app-rule" />
        <h1>{courseName}</h1>
        <p className="app-head__sub">
          {scoped
            ? "The student’s view of this course — every module it has turned on."
            : "Each one is set up by your instructor — it’ll tell you up front how it works and what it’s for, then lead you through it."}
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="app-modstack">
        {/* ── Agents ─────────────────────────────────────────────────────── */}
        <section
          ref={setRef("agents")}
          className="app-modpanel app-modpanel--open"
          data-module="agents"
        >
          <div className="app-modpanel__head">
            <div className="app-modpanel__heading">
              <span className="eyebrow">Tutors to talk to</span>
              <h2>Agents</h2>
            </div>
            {agents && agents.length > 0 && (
              <span className="app-modpanel__meta">
                {agents.length} total &middot; {inProgress} in progress &middot;{" "}
                {done} done
              </span>
            )}
          </div>
          <div className="app-modpanel__body">
            {agents === null ? (
              <p className="app-empty">Loading…</p>
            ) : agents.length === 0 ? (
              <p className="app-empty">
                Your instructor hasn&rsquo;t set anything up in this course yet.
                Check back soon.
              </p>
            ) : (
              <div className="app-agents">
                {agents.map((a, i) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    n={i + 1}
                    base={base}
                    navigate={navigate}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Writing (provenance) — only when the module is enabled ─────── */}
        {provenanceEnabled && (
        <section
          ref={setRef("writing")}
          className="app-modpanel app-modpanel--open"
          data-module="writing"
        >
          <div className="app-modpanel__head">
            <div className="app-modpanel__heading">
              <span className="eyebrow">Provenance</span>
              <h2>Writing</h2>
            </div>
            {docs && docs.length > 0 && (
              <span className="app-modpanel__meta">
                {docs.length} document{docs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="app-modpanel__body">
            <div className="app-writing__intro">
              <p className="app-writing__note">
                Write here and every word is tagged by where it came from —
                typed, pasted, or generated — so you can share the history of
                your work.
              </p>
              <Button
                variant="primary"
                icon={<PencilIcon size={16} />}
                onClick={onNewDocument}
                loading={creatingDoc}
                disabled={creatingDoc}
              >
                New document
              </Button>
            </div>
            {docs === null ? (
              <p className="app-empty">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="app-papers__empty">
                No documents in this course yet.
              </p>
            ) : (
              <ul className="app-papers__list">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`${base}/write/${d.id}${editorSuffix}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`${base}/write/${d.id}${editorSuffix}`);
                      }}
                    >
                      <span className="app-papers__ic" aria-hidden>
                        <DocIcon size={18} />
                      </span>
                      <span className="app-papers__main">
                        <span className="app-papers__title">{d.title}</span>
                        <span className="app-papers__meta">
                          {d.wordCount.toLocaleString()} word
                          {d.wordCount === 1 ? "" : "s"}
                          <i>·</i>
                          edited {relativeTime(d.updatedAt)}
                        </span>
                      </span>
                      <span className="app-papers__go" aria-hidden>
                        <ArrowIcon size={18} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}

        {/* No Attendance panel: check-in is QR-gated (a student arrives via a
            scanned session code at /a/:id), and there is no student-facing
            attendance-HISTORY API yet — a bare "scan the QR" card would be
            noise. When a student can see their own past check-in statuses,
            re-add an Attendance module panel here (and the nav item in
            StudentLayout), gated on `showAttendance`. */}
      </div>
    </div>
  );
}

function AgentRow({
  agent: a,
  n,
  base,
  navigate,
}: {
  agent: AgentSummary;
  n: number;
  base: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  // §13 state machine. Backbone completion is "play once": no button, just the
  // pill. Free-chat completion is meaningless (no exit condition), so always
  // show Start.
  const inProgress = a.lastConversationId !== null && a.lastCompletedAt === null;
  const completedBackbone = a.hasBackbone && a.lastCompletedAt !== null;
  const continueHref = `${base}/chat/${a.lastConversationId}`;
  const startHref = `${base}/chat/new/${a.id}`;
  const target = inProgress ? continueHref : startHref;

  const action = completedBackbone ? (
    <Badge
      tone="success"
      dot
      title={
        a.lastCompletedAt
          ? new Date(a.lastCompletedAt).toLocaleString()
          : undefined
      }
    >
      Completed {a.lastCompletedAt ? relativeTime(a.lastCompletedAt) : ""}
    </Badge>
  ) : inProgress ? (
    <>
      {!a.hasBackbone && (
        // v0.5 §10 + v0.7 §3.1: free-form agents can have parallel threads.
        <IconButton
          variant="round"
          href={startHref}
          title="Start a new chat with this agent"
        >
          <PlusIcon size={16} />
        </IconButton>
      )}
      <Button
        variant="primary"
        href={continueHref}
        className="app-agent__cta"
        iconRight={<ArrowIcon size={16} />}
      >
        Continue
      </Button>
    </>
  ) : (
    // §14: no conversation row is created here — the chat page enters compose
    // mode and only persists on first send.
    <Button
      variant="primary"
      href={startHref}
      className="app-agent__cta"
      iconRight={<ArrowIcon size={16} />}
    >
      Start
    </Button>
  );

  // The whole row is clickable (→ the row's default action), but the action
  // column holds its own real links, so a click there must not also fire the
  // row navigation.
  return (
    <div
      className="app-agent"
      role="link"
      tabIndex={0}
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(target);
      }}
    >
      <span className="app-agent__index">{String(n).padStart(2, "0")}</span>
      <Avatar name={a.title} agent={a.hasBackbone} size="lg" />
      <div className="app-agent__main">
        <div className="app-agent__title">{a.title}</div>
        <div className="app-agent__meta">
          <Badge tone={a.hasBackbone ? "brand" : "ghost"}>
            {a.hasBackbone ? "guided" : "free-form"}
          </Badge>
          {a.hasCollection && (
            <Badge tone="info" dot>
              grounded
            </Badge>
          )}
        </div>
      </div>
      <div className="app-agent__action" onClick={(e) => e.stopPropagation()}>
        {action}
      </div>
    </div>
  );
}
