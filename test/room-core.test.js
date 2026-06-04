import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDetails,
  buildHistory,
  buildRoomState,
  closeCurrentQuestion,
  createRoomMeta,
  endGame,
  joinParticipant,
  prepareNextQuestion,
  recordResponse,
  startQuestion,
} from "../api/lib/room-core.js";

const startedAt = "2026-06-04T06:00:00.000Z";

function createBundle() {
  return {
    meta: createRoomMeta({
      roomId: "ABC123",
      hostKey: "host-secret",
      shareOrigin: "https://example.com",
      now: startedAt,
    }),
    participants: {},
    responsesByQuestion: {},
  };
}

test("active room state reports live writing and submitted counts", () => {
  const bundle = createBundle();

  bundle.participants = joinParticipant(bundle.participants, {
    clientId: "client-a",
    nickname: "Alpha",
    now: "2026-06-04T06:00:05.000Z",
  });
  bundle.participants = joinParticipant(bundle.participants, {
    clientId: "client-b",
    nickname: "Beta",
    now: "2026-06-04T06:00:06.000Z",
  });
  bundle.meta = startQuestion(bundle.meta, {
    hostKey: "host-secret",
    question: "Coffee or tea?",
    optionA: "Coffee",
    optionB: "Tea",
    now: "2026-06-04T06:01:00.000Z",
  });
  bundle.responsesByQuestion[bundle.meta.currentQuestionId] = recordResponse(
    bundle.responsesByQuestion[bundle.meta.currentQuestionId],
    bundle.participants,
    bundle.meta,
    {
      clientId: "client-a",
      choice: "A",
      reason: "Need focus",
      now: "2026-06-04T06:01:10.000Z",
    },
  );

  const state = buildRoomState(bundle, {
    clientId: "client-a",
    now: "2026-06-04T06:01:12.000Z",
  });

  assert.equal(state.status, "active");
  assert.equal(state.counts.connected, 2);
  assert.equal(state.counts.responded, 1);
  assert.equal(state.counts.writing, 1);
  assert.equal(state.userResponse.choice, "A");
});

test("closed question details and history keep labels, reasons, and percentages", () => {
  const bundle = createBundle();

  bundle.participants = joinParticipant(bundle.participants, {
    clientId: "client-a",
    nickname: "Alpha",
    now: "2026-06-04T06:00:05.000Z",
  });
  bundle.participants = joinParticipant(bundle.participants, {
    clientId: "client-b",
    nickname: "Beta",
    now: "2026-06-04T06:00:06.000Z",
  });
  bundle.meta = startQuestion(bundle.meta, {
    hostKey: "host-secret",
    question: "Coffee or tea?",
    optionA: "Coffee",
    optionB: "Tea",
    now: "2026-06-04T06:01:00.000Z",
  });
  const questionId = bundle.meta.currentQuestionId;
  bundle.responsesByQuestion[questionId] = recordResponse(
    bundle.responsesByQuestion[questionId],
    bundle.participants,
    bundle.meta,
    {
      clientId: "client-a",
      choice: "A",
      reason: "Need focus",
      now: "2026-06-04T06:01:10.000Z",
    },
  );
  bundle.responsesByQuestion[questionId] = recordResponse(
    bundle.responsesByQuestion[questionId],
    bundle.participants,
    bundle.meta,
    {
      clientId: "client-b",
      choice: "B",
      reason: "Less caffeine",
      now: "2026-06-04T06:01:11.000Z",
    },
  );
  bundle.meta = closeCurrentQuestion(bundle.meta, {
    hostKey: "host-secret",
    now: "2026-06-04T06:02:00.000Z",
  });

  const details = buildDetails(bundle);
  const history = buildHistory(bundle);

  assert.deepEqual(
    details.rows.map((row) => [row.nickname, row.choice, row.choiceLabel, row.reason]),
    [
      ["Alpha", "A", "Coffee", "Need focus"],
      ["Beta", "B", "Tea", "Less caffeine"],
    ],
  );
  assert.equal(history.rounds.length, 1);
  assert.equal(history.rounds[0].results.total, 2);
  assert.deepEqual(
    history.rounds[0].results.options.map((option) => [option.key, option.count, option.percent]),
    [
      ["A", 1, 50],
      ["B", 1, 50],
    ],
  );
});

test("ended sessions can restart on the same room and keep cumulative history", () => {
  const bundle = createBundle();

  bundle.meta = startQuestion(bundle.meta, {
    hostKey: "host-secret",
    question: "First?",
    optionA: "A1",
    optionB: "B1",
    now: "2026-06-04T06:01:00.000Z",
  });
  bundle.meta = closeCurrentQuestion(bundle.meta, {
    hostKey: "host-secret",
    now: "2026-06-04T06:02:00.000Z",
  });
  bundle.meta = endGame(bundle.meta, {
    hostKey: "host-secret",
    now: "2026-06-04T06:03:00.000Z",
  });
  bundle.meta = startQuestion(bundle.meta, {
    hostKey: "host-secret",
    question: "Second?",
    optionA: "A2",
    optionB: "B2",
    now: "2026-06-04T06:04:00.000Z",
  });

  const state = buildRoomState(bundle, {
    clientId: "client-a",
    now: "2026-06-04T06:04:05.000Z",
  });
  const history = buildHistory(bundle);

  assert.equal(state.status, "active");
  assert.equal(state.question.text, "Second?");
  assert.equal(history.rounds.length, 2);
  assert.equal(history.rounds[0].question.text, "First?");
  assert.equal(history.rounds[1].question.text, "Second?");
});
