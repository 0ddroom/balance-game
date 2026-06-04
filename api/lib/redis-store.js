const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const KEY_PREFIX = "balance-game";

export async function createRoomRecord(meta, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const result = await redisCommand(["SET", metaKey(meta.id), JSON.stringify(meta), "NX", "EX", ttlSeconds]);
  return result === "OK";
}

export async function loadRoomBundle(roomId) {
  const meta = await loadMeta(roomId);
  if (!meta) return null;

  const questions = meta.questions || [];
  const commands = [["HGETALL", participantsKey(meta.id)], ...questions.map((question) => ["HGETALL", responsesKey(meta.id, question.id)])];
  const results = await redisPipeline(commands);
  const participants = parseJsonHash(results[0]?.result);
  const responsesByQuestion = {};

  questions.forEach((question, index) => {
    responsesByQuestion[question.id] = parseJsonHash(results[index + 1]?.result);
  });

  return {
    meta,
    participants,
    responsesByQuestion,
  };
}

export async function loadMeta(roomId) {
  const raw = await redisCommand(["GET", metaKey(roomId)]);
  return raw ? parseJson(raw, null) : null;
}

export async function saveMeta(meta, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  await redisCommand(["SET", metaKey(meta.id), JSON.stringify(meta), "EX", ttlSeconds]);
  await refreshRoomTtl(meta, { ttlSeconds });
}

export async function saveParticipant(roomId, participant, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  await redisCommand(["HSET", participantsKey(roomId), participant.clientId, JSON.stringify(participant)]);
  await redisCommand(["EXPIRE", participantsKey(roomId), ttlSeconds]);
}

export async function saveResponse(roomId, questionId, response, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  await redisCommand(["HSET", responsesKey(roomId, questionId), response.clientId, JSON.stringify(response)]);
  await redisCommand(["EXPIRE", responsesKey(roomId, questionId), ttlSeconds]);
}

export async function refreshRoomTtl(meta, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const commands = [["EXPIRE", metaKey(meta.id), ttlSeconds], ["EXPIRE", participantsKey(meta.id), ttlSeconds]];

  (meta.questions || []).forEach((question) => {
    commands.push(["EXPIRE", responsesKey(meta.id, question.id), ttlSeconds]);
  });

  await redisPipeline(commands);
}

export async function redisCommand(command, env = process.env) {
  const response = await redisFetch("", command, env);
  if (response.error) throw new Error(response.error);
  return response.result;
}

export async function redisPipeline(commands, env = process.env) {
  if (!commands.length) return [];
  const response = await redisFetch("/pipeline", commands, env);
  if (!Array.isArray(response)) {
    throw new Error("Redis pipeline 응답을 읽을 수 없습니다.");
  }

  response.forEach((item) => {
    if (item?.error) throw new Error(item.error);
  });

  return response;
}

function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Redis 환경변수(KV_REST_API_URL/KV_REST_API_TOKEN)를 Vercel에 설정해 주세요.");
  }

  return {
    url: String(url).replace(/\/+$/, ""),
    token,
  };
}

async function redisFetch(path, body, env) {
  const { url, token } = redisConfig(env);
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Redis 요청 실패 (${response.status})`);
  }

  return payload;
}

function metaKey(roomId) {
  return `${KEY_PREFIX}:room:${normalizeKey(roomId)}:meta`;
}

function participantsKey(roomId) {
  return `${KEY_PREFIX}:room:${normalizeKey(roomId)}:participants`;
}

function responsesKey(roomId, questionId) {
  return `${KEY_PREFIX}:room:${normalizeKey(roomId)}:responses:${normalizeKey(questionId)}`;
}

function parseJsonHash(value) {
  const rawHash = normalizeHashResult(value);
  const parsed = {};

  Object.entries(rawHash).forEach(([key, rawValue]) => {
    const item = parseJson(rawValue, null);
    if (item) parsed[key] = item;
  });

  return parsed;
}

function normalizeHashResult(value) {
  if (!value) return {};
  if (!Array.isArray(value)) return value;

  const hash = {};
  for (let index = 0; index < value.length; index += 2) {
    hash[value[index]] = value[index + 1];
  }
  return hash;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeKey(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}
