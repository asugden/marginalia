// The data client the UI talks to. Picks the real Worker-backed client or the
// token-free mock based on VITE_MOCK_API.
//
//   VITE_MOCK_API=true npm run dev:web   → mock (no Worker, no API key, no spend)
//   npm run dev:web                      → real (proxies /api to the Worker)
//
// Types always come from api.ts; only the function set is swapped.

import * as real from "./api.js";
import * as mock from "./mock.js";

export type {
  AgentDetail,
  AgentSummary,
  BackboneState,
  ChatMessage,
  CollectionDetail,
  CollectionSourceKind,
  CollectionSourceStatus,
  AdminCourse,
  AdminEntry,
  AdminUser,
  AuditEntry,
  UserDetail,
  CollectionSourceSummary,
  CollectionSummary,
  DuplicableAgentsGroup,
  DuplicableAgentSummary,
  EnrollmentRole,
  JoinCode,
  MeEnrollment,
  MeResponse,
  MessageSource,
  RosterEntry,
  ConversationSummary,
  ConversationView,
  TurnEvent,
  VoiceFull,
  VoiceListing,
  VoiceShareEntry,
  VoiceSummary,
  SharedVoiceSummary,
} from "./api.js";

const useMock = import.meta.env.VITE_MOCK_API === "true";

if (useMock) {
  console.info("[marginalia] MOCK API mode — no Worker, no tokens.");
}

const impl = useMock ? mock : real;

export const startConversation = impl.startConversation;
export const getConversation = impl.getConversation;
export const listConversations = impl.listConversations;
export const sendMessage = impl.sendMessage;
export const getMe = impl.getMe;
export const listVoices = impl.listVoices;
// v0.7 §1 — voice CRUD. Mock mode doesn't implement these (no per-user
// voices in the mock data model); the AuthorVoicesPage etc. throw if
// invoked under mock.
export const getVoice = (impl as typeof real).getVoice;
export const createVoice = (impl as typeof real).createVoice;
export const updateVoice = (impl as typeof real).updateVoice;
export const deleteVoice = (impl as typeof real).deleteVoice;
export const duplicateVoice = (impl as typeof real).duplicateVoice;
export const previewVoice = (impl as typeof real).previewVoice;
export const listVoiceShares = (impl as typeof real).listVoiceShares;
export const createVoiceShare = (impl as typeof real).createVoiceShare;
export const deleteVoiceShare = (impl as typeof real).deleteVoiceShare;
export const listAgents = impl.listAgents;
export const getAgent = impl.getAgent;
// v1.0 §7.1 — compose mode (/new/:agentId) doesn't know the course;
// the worker infers it from the agent row.
export const getAgentById = (impl as typeof real).getAgentById;
export const createAgent = impl.createAgent;
export const updateAgent = impl.updateAgent;
export const deleteAgent = impl.deleteAgent;
// v1.0 §4 — cross-course duplicate. Mock mode doesn't implement these;
// the UI calls them only inside the modal, which is unreachable under
// mock auth.
export const listDuplicableAgents = (impl as typeof real).listDuplicableAgents;
export const duplicateAgentTo = (impl as typeof real).duplicateAgentTo;
export const listCollections = impl.listCollections;
export const createCollection = impl.createCollection;
export const getCollection = impl.getCollection;
export const uploadCollectionSource = impl.uploadCollectionSource;
export const addCollectionUrlSource = impl.addCollectionUrlSource;
export const refreshCollectionSource = impl.refreshCollectionSource;
export const deleteCollectionSource = (impl as typeof real).deleteCollectionSource;
export const listRoster = impl.listRoster;
export const addRosterEntry = impl.addRosterEntry;
export const patchRosterEntry = impl.patchRosterEntry;
export const removeRosterEntry = impl.removeRosterEntry;
// v0.6 §4 — join codes. Mock mode doesn't implement these yet (the mock data
// model has no join_codes table); calling them in mock mode throws.
export const listJoinCodes = (impl as typeof real).listJoinCodes;
export const createJoinCode = (impl as typeof real).createJoinCode;
export const revokeJoinCode = (impl as typeof real).revokeJoinCode;
export const claimJoinCode = (impl as typeof real).claimJoinCode;
// v0.6 §5 — admin console. Mock mode doesn't simulate these (the mock has no
// per-org admin set or audit log).
export const listAdminCourses = (impl as typeof real).listAdminCourses;
export const createAdminCourse = (impl as typeof real).createAdminCourse;
export const deleteAdminCourse = (impl as typeof real).deleteAdminCourse;
export const listAdmins = (impl as typeof real).listAdmins;
export const promoteAdmin = (impl as typeof real).promoteAdmin;
export const demoteAdmin = (impl as typeof real).demoteAdmin;
export const listAdminUsers = (impl as typeof real).listAdminUsers;
export const getAdminUser = (impl as typeof real).getAdminUser;
export const listAuditLog = (impl as typeof real).listAuditLog;

// Pure helpers — same in mock and real, so re-export from api.ts directly.
export { citationOpenUrl } from "./api.js";
