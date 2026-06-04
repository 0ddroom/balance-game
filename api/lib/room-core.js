const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function createRoomMeta({ roomId, hostKey, shareOrigin = "", now = new Date().toISOString() }) {
  return {
    id: normalizeRoomId(roomId),
    hostKey,
    shareOrigin,
    status: "waiting",
    currentQuestionId: null,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function joinParticipant(participants = {}, { clientId, nickname, now = new Date().toISOString() }) {
  const safeClientId = requireValue(clientId, "참여자 정보가 없습니다.");
  const previous = participants[safeClientId] || {};

  return {
    ...participants,
    [safeClientId]: {
      clientId: safeClientId,
      nickname: sanitizeText(nickname, 24) || previous.nickname || "익명",
      joinedAt: previous.joinedAt || now,
      lastSeenAt: now,
    },
  };
}

export function touchParticipant(participants = {}, { clientId, now = new Date().toISOString() }) {
  if (!clientId || !participants[clientId]) return participants;

  return {
    ...participants,
    [clientId]: {
      ...participants[clientId],
      lastSeenAt: now,
    },
  };
}

export function startQuestion(
  meta,
  { hostKey, question, optionA, optionB, now = new Date().toISOString(), questionId = "" },
) {
  assertHost(meta, hostKey);

  if (meta.status === "active") {
    throw new Error("진행 중인 질문을 먼저 마감해 주세요.");
  }

  const text = sanitizeText(question, 160);
  const a = sanitizeText(optionA, 80);
  const b = sanitizeText(optionB, 80);

  if (!text || !a || !b) {
    throw new Error("질문과 선택지 A/B를 모두 입력해 주세요.");
  }

  const roundNumber = (meta.questions || []).length + 1;
  const id = questionId || createQuestionId(roundNumber, now);
  const nextQuestion = {
    id,
    roundNumber,
    text,
    optionA: a,
    optionB: b,
    startedAt: now,
    endedAt: null,
  };

  return {
    ...meta,
    status: "active",
    currentQuestionId: id,
    questions: [...(meta.questions || []), nextQuestion],
    updatedAt: now,
  };
}

export function closeCurrentQuestion(meta, { hostKey, now = new Date().toISOString() }) {
  assertHost(meta, hostKey);

  if (meta.status !== "active" || !meta.currentQuestionId) {
    throw new Error("마감할 질문이 없습니다.");
  }

  return {
    ...meta,
    status: "closed",
    questions: (meta.questions || []).map((question) =>
      question.id === meta.currentQuestionId
        ? {
            ...question,
            endedAt: question.endedAt || now,
          }
        : question,
    ),
    updatedAt: now,
  };
}

export function prepareNextQuestion(meta, { hostKey, now = new Date().toISOString() }) {
  assertHost(meta, hostKey);

  if (meta.status === "active") {
    throw new Error("진행 중인 질문을 먼저 마감해 주세요.");
  }

  return {
    ...meta,
    status: "waiting",
    currentQuestionId: null,
    updatedAt: now,
  };
}

export function endGame(meta, { hostKey, now = new Date().toISOString() }) {
  assertHost(meta, hostKey);

  return {
    ...meta,
    status: "ended",
    currentQuestionId: null,
    questions: (meta.questions || []).map((question) =>
      question.id === meta.currentQuestionId
        ? {
            ...question,
            endedAt: question.endedAt || now,
          }
        : question,
    ),
    updatedAt: now,
  };
}

export function recordResponse(
  responses = {},
  participants = {},
  meta,
  { clientId, choice, reason = "", now = new Date().toISOString() },
) {
  const safeClientId = requireValue(clientId, "참여자 정보가 없습니다.");
  const question = getCurrentQuestion(meta);

  if (meta.status !== "active" || !question) {
    throw new Error("현재 응답할 수 있는 질문이 없습니다.");
  }

  const normalizedChoice = normalizeChoice(choice);
  const participant = participants[safeClientId] || {
    clientId: safeClientId,
    nickname: "익명",
  };

  return {
    ...responses,
    [safeClientId]: {
      clientId: safeClientId,
      nickname: participant.nickname || "익명",
      questionId: question.id,
      choice: normalizedChoice,
      reason: sanitizeText(reason, 400),
      submittedAt: now,
    },
  };
}

export function buildRoomState(bundle, { clientId = "", now = new Date().toISOString() } = {}) {
  const meta = requireMeta(bundle?.meta);
  const participants = bundle.participants || {};
  const question = getCurrentQuestion(meta);
  const responses = question ? getResponsesForQuestion(bundle, question.id) : {};
  const connected = countOnlineParticipants(participants, now);
  const responded = Object.keys(responses).length;
  const counts = {
    connected: Math.max(connected, responded),
    responded,
    writing: Math.max(Math.max(connected, responded) - responded, 0),
  };
  const results = meta.status === "closed" && question ? buildQuestionResults(question, responses) : null;
  const lastRound = buildLastRound(bundle);

  return {
    roomId: meta.id,
    status: meta.status,
    question: question ? toQuestionDto(question) : null,
    counts,
    results,
    lastRound,
    userResponse: question && clientId && responses[clientId] ? toResponseDto(question, responses[clientId]) : null,
    host: {
      shareOrigin: meta.shareOrigin || "",
    },
    updatedAt: meta.updatedAt,
  };
}

export function buildDetails(bundle) {
  const question = selectDetailsQuestion(bundle);
  if (!question) {
    return {
      question: null,
      rows: [],
    };
  }

  return {
    question: toQuestionDto(question),
    rows: buildResponseRows(question, getResponsesForQuestion(bundle, question.id)),
  };
}

export function buildHistory(bundle) {
  const meta = requireMeta(bundle?.meta);
  const rounds = (meta.questions || []).map((question) => ({
    roundNumber: question.roundNumber,
    question: toQuestionDto(question),
    results: buildQuestionResults(question, getResponsesForQuestion(bundle, question.id)),
    rows: buildResponseRows(question, getResponsesForQuestion(bundle, question.id)),
    startedAt: question.startedAt,
    endedAt: question.endedAt,
  }));

  return {
    roomId: meta.id,
    rounds,
  };
}

export function buildQuestionResults(question, responses = {}) {
  const rows = Object.values(responses);
  const countA = rows.filter((row) => row.choice === "A").length;
  const countB = rows.filter((row) => row.choice === "B").length;
  const total = countA + countB;

  return {
    total,
    options: [
      {
        key: "A",
        label: question.optionA,
        count: countA,
        percent: total ? Math.round((countA / total) * 100) : 0,
      },
      {
        key: "B",
        label: question.optionB,
        count: countB,
        percent: total ? Math.round((countB / total) * 100) : 0,
      },
    ],
  };
}

export function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

export function normalizeChoice(choice) {
  const normalized = String(choice || "").trim().toUpperCase();
  if (normalized !== "A" && normalized !== "B") {
    throw new Error("A 또는 B 중 하나를 선택해 주세요.");
  }
  return normalized;
}

export function assertHost(meta, hostKey) {
  const safeMeta = requireMeta(meta);
  if (!hostKey || safeMeta.hostKey !== hostKey) {
    throw new Error("진행자 권한이 없습니다.");
  }
}

export function getCurrentQuestion(meta) {
  const safeMeta = requireMeta(meta);
  if (!safeMeta.currentQuestionId) return null;
  return (safeMeta.questions || []).find((question) => question.id === safeMeta.currentQuestionId) || null;
}

function buildLastRound(bundle) {
  const meta = requireMeta(bundle?.meta);
  const question = [...(meta.questions || [])].reverse().find((item) => item.endedAt) || null;
  if (!question) return null;

  return {
    question: toQuestionDto(question),
    results: buildQuestionResults(question, getResponsesForQuestion(bundle, question.id)),
    endedAt: question.endedAt,
  };
}

function buildResponseRows(question, responses = {}) {
  return Object.values(responses)
    .sort((left, right) => String(left.submittedAt || "").localeCompare(String(right.submittedAt || "")))
    .map((response) => toResponseDto(question, response));
}

function toResponseDto(question, response) {
  return {
    clientId: response.clientId,
    nickname: response.nickname || "익명",
    questionId: question.id,
    choice: response.choice,
    choiceLabel: response.choice === "A" ? question.optionA : question.optionB,
    reason: response.reason || "",
    submittedAt: response.submittedAt || "",
  };
}

function selectDetailsQuestion(bundle) {
  const meta = requireMeta(bundle?.meta);
  return getCurrentQuestion(meta) || [...(meta.questions || [])].reverse()[0] || null;
}

function toQuestionDto(question) {
  return {
    id: question.id,
    roundNumber: question.roundNumber,
    text: question.text,
    optionA: question.optionA,
    optionB: question.optionB,
    startedAt: question.startedAt,
    endedAt: question.endedAt,
  };
}

function getResponsesForQuestion(bundle, questionId) {
  return bundle?.responsesByQuestion?.[questionId] || {};
}

function countOnlineParticipants(participants = {}, now) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return Object.keys(participants).length;

  return Object.values(participants).filter((participant) => {
    const seenAt = new Date(participant.lastSeenAt || participant.joinedAt || 0).getTime();
    return Number.isFinite(seenAt) && nowMs - seenAt <= ONLINE_WINDOW_MS;
  }).length;
}

function createQuestionId(roundNumber, now) {
  const compactTime = String(Date.parse(now) || Date.now()).slice(-8);
  return `q${roundNumber}-${compactTime}`;
}

function sanitizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function requireMeta(meta) {
  if (!meta?.id) {
    throw new Error("방 정보를 찾을 수 없습니다.");
  }
  return meta;
}

function requireValue(value, message) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(message);
  return normalized;
}
