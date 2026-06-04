import { randomBytes } from "node:crypto";

import {
  assertHost,
  buildDetails,
  buildHistory,
  buildRoomState,
  closeCurrentQuestion,
  createRoomMeta,
  endGame,
  joinParticipant,
  normalizeRoomId,
  prepareNextQuestion,
  recordResponse,
  startQuestion,
  touchParticipant,
} from "../lib/room-core.js";
import {
  createRoomRecord,
  loadRoomBundle,
  refreshRoomTtl,
  saveMeta,
  saveParticipant,
  saveResponse,
} from "../lib/redis-store.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendError(res, 405, "POST 요청만 사용할 수 있습니다.");
    return;
  }

  const name = String(req.query.name || "");
  const payload = parseBody(req.body);

  try {
    const data = await dispatchRpc(name, payload);
    res.status(200).json(data);
  } catch (error) {
    sendError(res, 400, error.message || "요청을 처리하지 못했습니다.");
  }
}

async function dispatchRpc(name, payload) {
  const now = new Date().toISOString();

  switch (name) {
    case "balance_create_room":
      return createRoom(payload, now);
    case "balance_join_room":
      return joinRoom(payload, now);
    case "balance_room_state":
      return roomState(payload, now);
    case "balance_start_question":
      return mutateMeta(payload, now, (bundle) =>
        startQuestion(bundle.meta, {
          hostKey: payload.p_host_key,
          question: payload.p_question,
          optionA: payload.p_option_a,
          optionB: payload.p_option_b,
          now,
        }),
      );
    case "balance_close_question":
      return mutateMeta(payload, now, (bundle) =>
        closeCurrentQuestion(bundle.meta, {
          hostKey: payload.p_host_key,
          now,
        }),
      );
    case "balance_prepare_next":
      return mutateMeta(payload, now, (bundle) =>
        prepareNextQuestion(bundle.meta, {
          hostKey: payload.p_host_key,
          now,
        }),
      );
    case "balance_end_game":
      return mutateMeta(payload, now, (bundle) =>
        endGame(bundle.meta, {
          hostKey: payload.p_host_key,
          now,
        }),
      );
    case "balance_respond":
      return respond(payload, now);
    case "balance_room_details":
      return roomDetails(payload);
    case "balance_room_history":
      return roomHistory(payload);
    default:
      throw new Error("지원하지 않는 요청입니다.");
  }
}

async function createRoom(payload, now) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomId = createRoomId();
    const hostKey = randomBytes(24).toString("base64url");
    const meta = createRoomMeta({
      roomId,
      hostKey,
      shareOrigin: payload.p_share_origin || "",
      now,
    });
    const created = await createRoomRecord(meta);

    if (created) {
      return {
        roomId,
        hostKey,
        shareOrigin: meta.shareOrigin,
      };
    }
  }

  throw new Error("방을 만들지 못했습니다. 다시 시도해 주세요.");
}

async function joinRoom(payload, now) {
  const bundle = await requireBundle(payload.p_room_id);
  const participants = joinParticipant(bundle.participants, {
    clientId: payload.p_client_id,
    nickname: payload.p_nickname,
    now,
  });
  const participant = participants[String(payload.p_client_id || "").trim()];

  await saveParticipant(bundle.meta.id, participant);
  await refreshRoomTtl(bundle.meta);

  return { ok: true };
}

async function roomState(payload, now) {
  const bundle = await requireBundle(payload.p_room_id);

  if (payload.p_host_key) {
    assertHost(bundle.meta, payload.p_host_key);
  } else if (payload.p_client_id && bundle.participants[payload.p_client_id]) {
    const participants = touchParticipant(bundle.participants, {
      clientId: payload.p_client_id,
      now,
    });
    const participant = participants[payload.p_client_id];
    bundle.participants = participants;
    await saveParticipant(bundle.meta.id, participant);
  }

  return buildRoomState(bundle, {
    clientId: payload.p_client_id,
    now,
  });
}

async function mutateMeta(payload, now, updater) {
  const bundle = await requireBundle(payload.p_room_id);
  bundle.meta = updater(bundle);
  bundle.meta.updatedAt = now;
  await saveMeta(bundle.meta);
  return { ok: true };
}

async function respond(payload, now) {
  const bundle = await requireBundle(payload.p_room_id);
  const questionId = bundle.meta.currentQuestionId;
  const responses = recordResponse(bundle.responsesByQuestion[questionId], bundle.participants, bundle.meta, {
    clientId: payload.p_client_id,
    choice: payload.p_choice,
    reason: payload.p_reason,
    now,
  });
  const response = responses[String(payload.p_client_id || "").trim()];

  await saveResponse(bundle.meta.id, questionId, response);
  await refreshRoomTtl(bundle.meta);

  return { ok: true };
}

async function roomDetails(payload) {
  const bundle = await requireBundle(payload.p_room_id);
  return buildDetails(bundle);
}

async function roomHistory(payload) {
  const bundle = await requireBundle(payload.p_room_id);
  assertHost(bundle.meta, payload.p_host_key);
  return buildHistory(bundle);
}

async function requireBundle(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) {
    throw new Error("방 코드를 확인해 주세요.");
  }

  const bundle = await loadRoomBundle(normalizedRoomId);
  if (!bundle) {
    throw new Error("방을 찾을 수 없습니다.");
  }

  return bundle;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function createRoomId() {
  let roomId = "";
  for (let index = 0; index < 6; index += 1) {
    roomId += ROOM_ALPHABET[randomBytes(1)[0] % ROOM_ALPHABET.length];
  }
  return roomId;
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}
