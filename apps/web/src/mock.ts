// Mock API — token-free frontend development. Activated by VITE_MOCK_API=true.
// Mirrors the real client in api.ts: same signatures, same TurnEvent stream,
// realistic delta timing. No Worker, no API key, no spend.
//
// It runs a real (in-memory) copy of the backbone state machine so the progress
// sidebar advances and the completion message fires exactly as in production.
// In mock mode there is exactly one canned agent (the demo); the author UI is
// real-API only.

import { LIBRARY } from "@marginalia/voices";
import type {
  AgentDetail,
  AgentSummary,
  BackboneState,
  CollectionDetail,
  CollectionSourceStatus,
  CollectionSummary,
  ConversationSummary,
  ConversationView,
  TurnEvent,
  VoiceListing,
} from "./api.js";

const MOCK_TOPICS = [
  { title: "Frame the author's central claim", budget: 2 },
  { title: "Locate the strongest piece of evidence in the text", budget: 3 },
  { title: "Identify the assumption the argument rests on", budget: 4 },
  { title: "Propose one counter-reading and weigh it", budget: 3 },
];
const COMPLETION =
  "Nice work — you've worked through the author's claim, evidence, and an alternative reading. " +
  "That's the backbone of close reading.";

const MOCK_AGENT_ID = "agent_demo";
const MOCK_AGENT_TITLE = "Close-read a primary source";

// In-memory store, keyed by conversation id. Resets on page reload.
interface MockConvo {
  state: BackboneState;
  messages: ConversationView["messages"];
  completedAt: number | null;
  updatedAt: number;
}
const store = new Map<string, MockConvo>();

const initialState = (): BackboneState => ({
  currentTopicIndex: 0,
  turnsOnTopic: 0,
  totalTurns: 0,
  finished: false,
});

/**
 * Combined create + first-turn (v0.4 §14). Yields `started` then delegates
 * the rest of the stream to sendMessage so the same fake reply lands.
 */
export async function* startConversation(
  _agentId: string,
  content: string,
  _signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const conversationId = `mock_${crypto.randomUUID()}`;
  const state = initialState();
  store.set(conversationId, {
    state,
    messages: [],
    completedAt: null,
    updatedAt: Date.now(),
  });
  const firstTopic = MOCK_TOPICS[0];
  yield {
    type: "started",
    conversationId,
    agent: { id: MOCK_AGENT_ID, title: MOCK_AGENT_TITLE },
    state,
    currentTopic: firstTopic ? { title: firstTopic.title, index: 0 } : null,
  };
  for await (const ev of sendMessage(conversationId, content)) {
    yield ev;
  }
}

export async function getConversation(id: string): Promise<ConversationView> {
  const convo = store.get(id) ?? {
    state: initialState(),
    messages: [],
    completedAt: null,
    updatedAt: Date.now(),
  };
  const topic = MOCK_TOPICS[convo.state.currentTopicIndex];
  return {
    conversationId: id,
    courseId: "course_demo",
    agent: { id: MOCK_AGENT_ID, title: MOCK_AGENT_TITLE },
    clarityNote:
      "Your instructor set this up to walk you through a sequence of topics, " +
      "one at a time. It decides when you're ready to move on.",
    state: convo.state,
    currentTopic: topic
      ? { title: topic.title, index: convo.state.currentTopicIndex }
      : null,
    completedAt: convo.completedAt,
    messages: convo.messages,
  };
}

export async function listConversations(): Promise<{
  conversations: ConversationSummary[];
}> {
  const items: ConversationSummary[] = Array.from(store.entries())
    .map(([id, c]) => {
      const total = MOCK_TOPICS.length;
      const idx = Math.min(c.state.currentTopicIndex, total - 1);
      const completed = c.state.finished || c.completedAt !== null;
      return {
        id,
        title: completed
          ? `${MOCK_AGENT_TITLE} — completed`
          : `${MOCK_AGENT_TITLE} — topic ${idx + 1}/${total}`,
        agentName: MOCK_AGENT_TITLE,
        topicProgress: { index: idx, total },
        completedAt: c.completedAt,
        updatedAt: c.updatedAt,
        hasBackbone: true,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { conversations: items };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeReply(state: BackboneState): string {
  const topic = MOCK_TOPICS[state.currentTopicIndex];
  if (!topic) return "Let's wrap up here.";
  return (
    `[mock] Good — let's stay with "${topic.title}". ` +
    `Here's a question to push your thinking a little further: ` +
    `can you explain that idea in your own words, with a concrete example?`
  );
}

export async function* sendMessage(
  conversationId: string,
  content: string,
  _signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const convo = store.get(conversationId);
  if (!convo) {
    yield { type: "error", message: "Unknown conversation (mock)" };
    return;
  }

  convo.messages.push({ role: "user", content });

  const prev = convo.state;
  const topic = MOCK_TOPICS[prev.currentTopicIndex];
  const turnsOnTopic = prev.turnsOnTopic + 1;
  const totalTurns = prev.totalTurns + 1;
  const budgetSpent = !topic || turnsOnTopic >= topic.budget;

  let next: BackboneState;
  if (budgetSpent) {
    const nextIndex = prev.currentTopicIndex + 1;
    const finished = nextIndex >= MOCK_TOPICS.length;
    next = { currentTopicIndex: nextIndex, turnsOnTopic: 0, totalTurns, finished };
  } else {
    next = { ...prev, turnsOnTopic, totalTurns };
  }

  const reply = next.finished ? "[mock] That completes the backbone." : fakeReply(prev);
  let assembled = "";
  for (const word of reply.split(" ")) {
    const chunk = (assembled ? " " : "") + word;
    assembled += chunk;
    await sleep(35);
    yield { type: "delta", text: chunk };
  }

  convo.messages.push({ role: "assistant", content: assembled });
  convo.state = next;
  convo.updatedAt = Date.now();
  if (next.finished && convo.completedAt === null) {
    convo.completedAt = Date.now();
  }

  const nextTopic = MOCK_TOPICS[next.currentTopicIndex];
  yield {
    type: "done",
    state: next,
    transition: budgetSpent ? (next.finished ? "finished" : "forced") : "stay",
    currentTopic: nextTopic
      ? { title: nextTopic.title, index: next.currentTopicIndex }
      : null,
    completedAt: next.finished ? convo.completedAt : null,
    completionMessage: next.finished ? COMPLETION : null,
    conversationTitle: null,
  };
}

// ── stubs for author endpoints ─────────────────────────────────────────────
// Mock mode is for student-flow iteration; the author UI requires the real
// Worker. These keep client.ts happy and surface a helpful error.

const mockNotSupported = (label: string) => {
  throw new Error(
    `${label} is not available in mock mode — run \`npm run dev:web\` against the Worker.`,
  );
};

export async function listVoices(_courseId?: string): Promise<VoiceListing> {
  return {
    library: LIBRARY.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
    })),
    owned: [],
    shared: [],
  };
}

export async function listAgents(
  _courseId: string,
): Promise<{ agents: AgentSummary[] }> {
  return {
    agents: [
      {
        id: MOCK_AGENT_ID,
        title: MOCK_AGENT_TITLE,
        hasBackbone: true,
        hasCollection: false,
        voice: { kind: "library", id: "socratic" },
        updatedAt: 0,
        lastConversationId: null,
        lastUpdatedAt: null,
        lastCompletedAt: null,
      },
    ],
  };
}

export async function getAgent(
  _courseId: string,
  _agentId: string,
): Promise<AgentDetail> {
  return mockNotSupported("Agent edit") as never;
}

export async function createAgent(): Promise<{ id: string }> {
  return mockNotSupported("Agent save") as never;
}

export async function updateAgent(): Promise<{ ok: true }> {
  return mockNotSupported("Agent save") as never;
}

export async function deleteAgent(): Promise<void> {
  return mockNotSupported("Agent delete") as never;
}

export async function listCollections(
  _courseId: string,
): Promise<{ collections: CollectionSummary[] }> {
  return { collections: [] };
}

export async function createCollection(): Promise<CollectionSummary> {
  return mockNotSupported("Collection create") as never;
}

export async function getCollection(): Promise<CollectionDetail> {
  return mockNotSupported("Collection detail") as never;
}

export async function uploadCollectionSource(): Promise<{
  id: string;
  status: CollectionSourceStatus;
  chunks?: number;
  error?: string;
}> {
  return mockNotSupported("Collection upload") as never;
}

export async function addCollectionUrlSource(): Promise<{
  id: string;
  status: CollectionSourceStatus;
  chunks?: number;
  error?: string;
}> {
  return mockNotSupported("Collection URL source") as never;
}

export async function refreshCollectionSource(): Promise<{
  id: string;
  status: CollectionSourceStatus;
  chunks?: number;
  fetchedAt?: number;
}> {
  return mockNotSupported("Collection source refresh") as never;
}

export async function getMe(): Promise<{
  email: string;
  registered: boolean;
  userId: string | null;
  isAdmin: boolean;
  enrollments: Array<{
    courseId: string;
    courseName: string;
    role: "student" | "instructor";
    joinedAt: number;
    showAttendance: boolean;
    showCollections: boolean;
    hideProvenanceMarks: boolean;
  }>;
}> {
  return {
    email: "mock@marginalia.local",
    registered: true,
    userId: "user_mock",
    isAdmin: true,
    enrollments: [
      {
        courseId: "course_demo",
        courseName: "Demo course",
        role: "instructor",
        joinedAt: Date.now(),
        showAttendance: true,
        showCollections: true,
        hideProvenanceMarks: false,
      },
    ],
  };
}

export async function listRoster(): Promise<{ roster: never[] }> {
  return { roster: [] };
}
export async function addRosterEntry(): Promise<never> {
  return mockNotSupported("Roster add") as never;
}
export async function patchRosterEntry(): Promise<never> {
  return mockNotSupported("Roster patch") as never;
}
export async function removeRosterEntry(): Promise<never> {
  return mockNotSupported("Roster remove") as never;
}
export async function listJoinCodes(): Promise<never> {
  return mockNotSupported("Join code list") as never;
}
export async function createJoinCode(): Promise<never> {
  return mockNotSupported("Join code create") as never;
}
export async function revokeJoinCode(): Promise<never> {
  return mockNotSupported("Join code revoke") as never;
}
export async function claimJoinCode(): Promise<never> {
  return mockNotSupported("Join code claim") as never;
}
export async function listAdminCourses(): Promise<never> {
  return mockNotSupported("Admin: list courses") as never;
}
export async function createAdminCourse(): Promise<never> {
  return mockNotSupported("Admin: create course") as never;
}
export async function deleteAdminCourse(): Promise<never> {
  return mockNotSupported("Admin: delete course") as never;
}
export async function listAdmins(): Promise<never> {
  return mockNotSupported("Admin: list admins") as never;
}
export async function promoteAdmin(): Promise<never> {
  return mockNotSupported("Admin: promote") as never;
}
export async function demoteAdmin(): Promise<never> {
  return mockNotSupported("Admin: demote") as never;
}
export async function listAdminUsers(): Promise<never> {
  return mockNotSupported("Admin: list users") as never;
}
export async function listAuditLog(): Promise<never> {
  return mockNotSupported("Admin: audit log") as never;
}
