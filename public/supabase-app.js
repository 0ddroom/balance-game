const config = window.BALANCE_GAME_CONFIG || {};
const useSupabase = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.USE_NODE_SERVER);

if (useSupabase) {
  const { createClient } = window.supabase || {};

  if (!createClient) {
    throw new Error("Supabase SDK를 불러오지 못했습니다.");
  }

  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const presets = [
    {
      question: "하루 동안 둘 중 하나만 가능하다면?",
      optionA: "휴대폰 없이 지내기",
      optionB: "인터넷 없이 지내기",
    },
    {
      question: "평생 하나를 포기해야 한다면?",
      optionA: "커피 포기",
      optionB: "탄산음료 포기",
    },
    {
      question: "여행 스타일을 하나만 고른다면?",
      optionA: "계획표대로 촘촘하게 여행",
      optionB: "즉흥적으로 흘러가는 여행",
    },
    {
      question: "업무 집중 방식으로 더 끌리는 쪽은?",
      optionA: "아침에 몰아서 끝내기",
      optionB: "밤에 조용히 끝내기",
    },
  ];
  const pieColors = ["#0f9f6e", "#2368d8", "#f7a90c", "#f04438"];

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const initialRoom = (params.get("room") || params.get("roomId") || "").toUpperCase();
  const initialHost = params.get("host") === "1";

  const els = {
    roomBadge: $("roomBadge"),
    soundToggleBtn: $("soundToggleBtn"),
    landingView: $("landingView"),
    createRoomBtn: $("createRoomBtn"),
    hostView: $("hostView"),
    participantView: $("participantView"),
    hostRoomCode: $("hostRoomCode"),
    shareLinkInput: $("shareLinkInput"),
    copyLinkBtn: $("copyLinkBtn"),
    qrCode: $("qrCode"),
    hostConnectedCount: $("hostConnectedCount"),
    hostRespondedCount: $("hostRespondedCount"),
    hostWritingCount: $("hostWritingCount"),
    hostStatusTitle: $("hostStatusTitle"),
    hostStatusBadge: $("hostStatusBadge"),
    questionForm: $("questionForm"),
    presetSelect: $("presetSelect"),
    applyPresetBtn: $("applyPresetBtn"),
    questionInput: $("questionInput"),
    optionAInput: $("optionAInput"),
    optionBInput: $("optionBInput"),
    startQuestionBtn: $("startQuestionBtn"),
    hostLivePanel: $("hostLivePanel"),
    hostQuestionText: $("hostQuestionText"),
    hostOptionA: $("hostOptionA"),
    hostOptionB: $("hostOptionB"),
    closeQuestionBtn: $("closeQuestionBtn"),
    hostResultPanel: $("hostResultPanel"),
    hostResultTitle: $("hostResultTitle"),
    hostResultGraph: $("hostResultGraph"),
    openDetailsBtn: $("openDetailsBtn"),
    prepareNextBtn: $("prepareNextBtn"),
    endGameBtn: $("endGameBtn"),
    endGameWaitingBtn: $("endGameWaitingBtn"),
    hostEndPanel: $("hostEndPanel"),
    hostEndedPanel: $("hostEndedPanel"),
    hostHistoryPanel: $("hostHistoryPanel"),
    hostHistoryList: $("hostHistoryList"),
    refreshHistoryBtn: $("refreshHistoryBtn"),
    downloadHistoryBtn: $("downloadHistoryBtn"),
    joinPanel: $("joinPanel"),
    joinForm: $("joinForm"),
    nicknameInput: $("nicknameInput"),
    answerPanel: $("answerPanel"),
    participantLiveCount: $("participantLiveCount"),
    participantSubmittedCount: $("participantSubmittedCount"),
    participantQuestionText: $("participantQuestionText"),
    participantOptionA: $("participantOptionA"),
    participantOptionB: $("participantOptionB"),
    choiceAButton: $("choiceAButton"),
    choiceBButton: $("choiceBButton"),
    reasonInput: $("reasonInput"),
    submitAnswerBtn: $("submitAnswerBtn"),
    waitingPanel: $("waitingPanel"),
    waitingTitle: $("waitingTitle"),
    waitingLiveStatus: $("waitingLiveStatus"),
    waitingWritingCount: $("waitingWritingCount"),
    waitingSubmittedCount: $("waitingSubmittedCount"),
    waitingSubtext: $("waitingSubtext"),
    waitingResultCard: $("waitingResultCard"),
    waitingResultTitle: $("waitingResultTitle"),
    waitingResultGraph: $("waitingResultGraph"),
    waitingDetailsBtn: $("waitingDetailsBtn"),
    participantResultPanel: $("participantResultPanel"),
    participantResultTitle: $("participantResultTitle"),
    participantResultGraph: $("participantResultGraph"),
    participantDetailsBtn: $("participantDetailsBtn"),
    endedPanel: $("endedPanel"),
    detailsModal: $("detailsModal"),
    detailsRows: $("detailsRows"),
    closeDetailsBtn: $("closeDetailsBtn"),
    toast: $("toast"),
  };

  let roomId = initialRoom;
  let hostKey = params.get("key") || "";
  let role = initialHost ? "host" : "participant";
  let roomChannel = null;
  let state = null;
  let selectedChoice = "";
  let formQuestionId = "";
  let lastQrLink = "";
  let toastTimer = null;
  let onlineParticipants = 0;
  let historyState = null;
  let historyLoading = false;
  let historyError = "";
  let historyRequestKey = "";

  const clientId = getClientId();
  const soundEngine = createSoundEngine();

  bindEvents();
  init();

  function getClientId() {
    const existing = localStorage.getItem("balanceGameClientId");
    if (existing) return existing;

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("balanceGameClientId", id);
    return id;
  }

  function nicknameKey() {
    return `balanceGameNickname:${roomId}`;
  }

  function joinedKey() {
    return `balanceGameJoined:${roomId}`;
  }

  function bindEvents() {
    els.createRoomBtn.addEventListener("click", createRoom);
    els.copyLinkBtn.addEventListener("click", copyShareLink);
    els.questionForm.addEventListener("submit", startQuestion);
    els.applyPresetBtn.addEventListener("click", applyPreset);
    els.closeQuestionBtn.addEventListener("click", closeQuestion);
    els.prepareNextBtn.addEventListener("click", prepareNext);
    els.endGameBtn.addEventListener("click", endGame);
    els.endGameWaitingBtn?.addEventListener("click", endGame);
    els.openDetailsBtn.addEventListener("click", openDetails);
    els.waitingDetailsBtn.addEventListener("click", openDetails);
    els.participantDetailsBtn.addEventListener("click", openDetails);
    els.refreshHistoryBtn?.addEventListener("click", () => loadHistory({ force: true }));
    els.downloadHistoryBtn?.addEventListener("click", downloadHistoryImage);
    els.closeDetailsBtn.addEventListener("click", closeDetails);
    els.soundToggleBtn.addEventListener("click", () => soundEngine.toggleMuted());
    document.addEventListener("pointerdown", () => soundEngine.unlock(), { passive: true });
    document.addEventListener("keydown", () => soundEngine.unlock());
    document.addEventListener("click", (event) => {
      if (event.target.closest("button")) soundEngine.playClick();
    });
    els.detailsModal.addEventListener("click", (event) => {
      if (event.target === els.detailsModal) closeDetails();
    });
    els.joinForm.addEventListener("submit", joinRoom);
    els.choiceAButton.addEventListener("click", () => selectChoice("A"));
    els.choiceBButton.addEventListener("click", () => selectChoice("B"));
    els.submitAnswerBtn.addEventListener("click", submitAnswer);

    presets.forEach((preset, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = preset.question;
      els.presetSelect.appendChild(option);
    });
  }

  function init() {
    if (initialHost && !roomId) {
      createRoom();
      return;
    }

    if (initialHost && roomId) {
      enterHostView();
      return;
    }

    if (roomId) {
      enterParticipantView();
      return;
    }

    els.landingView.classList.remove("hidden");
    els.hostView.classList.add("hidden");
    els.participantView.classList.add("hidden");
  }

  async function createRoom() {
    try {
      const { data, error } = await client.rpc("balance_create_room", {
        p_share_origin: appBaseUrl(),
      });
      if (error) throw error;

      roomId = data.roomId;
      hostKey = data.hostKey;
      role = "host";
      localStorage.setItem(`balanceGameHostKey:${roomId}`, hostKey);
      window.history.replaceState({}, "", `?host=1&room=${roomId}&key=${hostKey}`);
      enterHostView();
      await broadcastUpdate();
    } catch (error) {
      showToast(error.message);
    }
  }

  function enterHostView() {
    role = "host";
    els.landingView.classList.add("hidden");
    els.participantView.classList.add("hidden");
    els.hostView.classList.remove("hidden");
    els.roomBadge.textContent = `방 ${roomId}`;
    renderHostShareInfo();
    subscribeRoom();
    loadState();
  }

  function enterParticipantView() {
    role = "participant";
    els.landingView.classList.add("hidden");
    els.hostView.classList.add("hidden");
    els.participantView.classList.remove("hidden");
    els.roomBadge.textContent = `방 ${roomId}`;

    els.nicknameInput.value = localStorage.getItem(nicknameKey()) || randomNickname();

    if (localStorage.getItem(joinedKey()) === "1") {
      joinRoom(new Event("submit"));
    } else {
      loadState();
      renderParticipant();
    }
  }

  async function subscribeRoom() {
    if (!roomId) return;

    if (roomChannel) {
      await client.removeChannel(roomChannel);
      roomChannel = null;
    }

    roomChannel = client.channel(`balance-game:${roomId}`, {
      config: {
        presence: {
          key: clientId,
        },
      },
    });

    roomChannel
      .on("broadcast", { event: "room-updated" }, () => loadState())
      .on("presence", { event: "sync" }, () => {
        onlineParticipants = countOnlineParticipants();
        render();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const nickname = localStorage.getItem(nicknameKey()) || "";
          await roomChannel.track({
            clientId,
            role,
            nickname,
            onlineAt: new Date().toISOString(),
          });
          onlineParticipants = countOnlineParticipants();
          await loadState();
        }
      });
  }

  function countOnlineParticipants() {
    if (!roomChannel) return 0;

    const presenceState = roomChannel.presenceState();
    const ids = new Set();

    Object.values(presenceState).forEach((entries) => {
      entries.forEach((entry) => {
        if (entry.role === "participant") ids.add(entry.clientId);
      });
    });

    return ids.size;
  }

  async function loadState() {
    if (!roomId) return;

    try {
      const { data, error } = await client.rpc("balance_room_state", {
        p_room_id: roomId,
        p_client_id: clientId,
        p_host_key: role === "host" ? hostKey : null,
      });
      if (error) throw error;

      state = data;
      render();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function broadcastUpdate() {
    await loadState();

    if (!roomChannel) return;

    await roomChannel.send({
      type: "broadcast",
      event: "room-updated",
      payload: {
        roomId,
        updatedAt: Date.now(),
      },
    });
  }

  function render() {
    if (!state) return;

    const counts = state.counts || {};
    const connected = Math.max(onlineParticipants || counts.connected || 0, counts.responded || 0);
    state.counts = {
      ...counts,
      connected,
      writing: Math.max(connected - (counts.responded || 0), 0),
    };

    document.body.dataset.roomStatus = state.status || "landing";
    document.body.dataset.role = role;

    if (role === "host") {
      renderHost();
    } else {
      renderParticipant();
    }

    syncSound();
  }

  function renderHost() {
    renderHostShareInfo();
    els.hostConnectedCount.textContent = `${state.counts.connected}명`;
    els.hostRespondedCount.textContent = `${state.counts.responded}명`;
    els.hostWritingCount.textContent = `${state.counts.writing}명`;
    els.hostStatusBadge.textContent = statusText(state.status);
    const canStartQuestion = ["waiting", "ended"].includes(state.status);
    els.hostStatusTitle.textContent =
      state.status === "active"
        ? "응답을 받고 있습니다"
        : state.status === "closed"
          ? "결과 공개 중"
          : state.status === "ended"
            ? "게임 종료 - 같은 링크로 재개할 수 있습니다"
            : "다음 질문 준비";

    els.questionForm.classList.toggle("hidden", !canStartQuestion);
    els.startQuestionBtn.textContent = state.status === "ended" ? "같은 링크로 다시 시작" : "질문 시작";
    els.hostLivePanel.classList.toggle("hidden", state.status !== "active");
    els.hostResultPanel.classList.toggle("hidden", state.status !== "closed");
    els.hostEndPanel.classList.toggle("hidden", !["waiting"].includes(state.status));
    els.hostEndedPanel.classList.toggle("hidden", state.status !== "ended");

    if (state.question) {
      els.hostQuestionText.textContent = state.question.text;
      els.hostOptionA.textContent = state.question.optionA;
      els.hostOptionB.textContent = state.question.optionB;
      els.hostResultTitle.textContent = state.question.text;
    }

    if (state.results) {
      renderResultGraph(els.hostResultGraph, state.results);
    }

    renderHostHistory();
    queueHistoryLoad();
  }

  function renderParticipant() {
    const joined = localStorage.getItem(joinedKey()) === "1";
    els.joinPanel.classList.toggle("hidden", joined);
    els.answerPanel.classList.add("hidden");
    els.waitingPanel.classList.add("hidden");
    els.waitingResultCard.classList.add("hidden");
    els.participantResultPanel.classList.add("hidden");
    els.endedPanel.classList.add("hidden");

    if (state?.status === "ended") {
      els.joinPanel.classList.add("hidden");
      renderEndedPanel();
      return;
    }

    if (!joined) return;

    els.participantLiveCount.textContent = `${state.counts.writing}명이 응답 중`;
    els.participantSubmittedCount.textContent = `${state.counts.responded}명 제출`;

    if (state.status === "active" && state.question) {
      const alreadySubmitted = state.userResponse?.questionId === state.question.id;

      if (formQuestionId !== state.question.id) {
        formQuestionId = state.question.id;
        selectedChoice = "";
        els.reasonInput.value = "";
        updateChoiceButtons();
      }

      if (alreadySubmitted) {
        showWaiting({
          title: "응답 대기중",
          subtext: "응답이 제출되었습니다. 결과 공개를 기다려 주세요.",
          showLiveStatus: true,
        });
        return;
      }

      els.answerPanel.classList.remove("hidden");
      els.participantQuestionText.textContent = state.question.text;
      els.participantOptionA.textContent = state.question.optionA;
      els.participantOptionB.textContent = state.question.optionB;
      return;
    }

    if (state.status === "closed" && state.results) {
      els.participantResultPanel.classList.remove("hidden");
      els.participantResultTitle.textContent = state.question?.text || "응답 결과";
      renderResultGraph(els.participantResultGraph, state.results);
      return;
    }

    showWaiting({
      title: "질문 작성중",
      subtext: "잠시만 기다려 주세요.",
      showLastRound: Boolean(state.lastRound),
    });
  }

  function renderEndedPanel() {
    els.endedPanel.classList.remove("hidden");
  }

  function shouldShowHistory() {
    return role === "host" && (["closed", "ended"].includes(state?.status) || Boolean(historyState?.rounds?.length));
  }

  function queueHistoryLoad() {
    if (!shouldShowHistory() || historyLoading) return;

    const key = [
      roomId,
      state?.status || "",
      state?.question?.id || "",
      state?.lastRound?.endedAt || "",
    ].join(":");

    if (historyRequestKey === key && historyState) return;
    historyRequestKey = key;
    void loadHistory({ silent: true });
  }

  async function loadHistory({ silent = false, force = false } = {}) {
    if (!roomId || role !== "host" || historyLoading) return;

    if (force) historyRequestKey = "";

    historyLoading = true;
    renderHostHistory();

    try {
      const { data, error } = await client.rpc("balance_room_history", {
        p_room_id: roomId,
        p_host_key: hostKey,
      });
      if (error) throw error;

      historyState = data || { roomId, rounds: [] };
      historyError = "";
    } catch (error) {
      historyError = String(error.message || error);
      if (historyError.includes("balance_room_history")) {
        historyError = "Supabase에 누적 현황 SQL을 먼저 적용해 주세요.";
      }
      if (!silent) showToast(historyError);
    } finally {
      historyLoading = false;
      renderHostHistory();
    }
  }

  function renderHostHistory() {
    if (!els.hostHistoryPanel || !els.hostHistoryList) return;

    const visible = shouldShowHistory();
    els.hostHistoryPanel.classList.toggle("hidden", !visible);
    if (!visible) return;

    if (historyLoading && !historyState) {
      els.hostHistoryList.innerHTML = `<p class="muted-text">누적 현황을 불러오는 중입니다.</p>`;
      if (els.downloadHistoryBtn) els.downloadHistoryBtn.disabled = true;
      return;
    }

    if (historyError) {
      els.hostHistoryList.innerHTML = `<p class="muted-text">${escapeHtml(historyError)}</p>`;
      if (els.downloadHistoryBtn) els.downloadHistoryBtn.disabled = true;
      return;
    }

    const rounds = historyState?.rounds || [];
    if (els.downloadHistoryBtn) els.downloadHistoryBtn.disabled = rounds.length === 0;

    if (!rounds.length) {
      els.hostHistoryList.innerHTML = `<p class="muted-text">아직 누적된 질문 현황이 없습니다.</p>`;
      return;
    }

    els.hostHistoryList.innerHTML = rounds.map(renderHistoryRound).join("");
  }

  function renderHistoryRound(round) {
    const rows = round.rows || [];
    const question = round.question || {};
    const total = round.results?.total || 0;
    const detailRows = rows.length
      ? rows
          .map(
            (row) => `
              <div class="history-detail-row">
                <strong>${escapeHtml(row.nickname || "익명")}</strong>
                <span>${escapeHtml(row.choice || "")}. ${escapeHtml(row.choiceLabel || "")}</span>
                <p>${escapeHtml(row.reason || "이유 미작성")}</p>
              </div>
            `,
          )
          .join("")
      : `<p class="muted-text">제출된 응답이 없습니다.</p>`;

    return `
      <article class="history-round">
        <div class="history-round-header">
          <span>Q${escapeHtml(String(round.roundNumber || ""))}</span>
          <div>
            <h4>${escapeHtml(question.text || "질문 없음")}</h4>
            <p>${total}명 응답</p>
          </div>
        </div>
        <div class="result-graph">${resultGraphHtml(round.results || { options: [] })}</div>
        <div class="history-details">${detailRows}</div>
      </article>
    `;
  }

  function renderHostShareInfo() {
    if (!roomId) return;

    const shareLink = `${appBaseUrl()}?room=${roomId}`;
    els.hostRoomCode.textContent = roomId;
    els.shareLinkInput.value = shareLink;

    if (shareLink !== lastQrLink) {
      renderQr(shareLink);
      lastQrLink = shareLink;
    }
  }

  function showWaiting({ title, subtext, showLastRound = false, showLiveStatus = false }) {
    els.waitingPanel.classList.remove("hidden");
    els.waitingTitle.textContent = title;
    els.waitingSubtext.textContent = subtext;
    els.waitingLiveStatus.classList.toggle("hidden", !showLiveStatus);
    els.waitingWritingCount.textContent = `${state.counts.writing}명 응답 중`;
    els.waitingSubmittedCount.textContent = `${state.counts.responded}명 제출`;

    if (showLastRound && state?.lastRound?.results) {
      els.waitingResultCard.classList.remove("hidden");
      els.waitingResultTitle.textContent = state.lastRound.question?.text || "직전 응답 결과";
      renderResultGraph(els.waitingResultGraph, state.lastRound.results);
    }
  }

  async function joinRoom(event) {
    event.preventDefault();

    if (!roomId) {
      showToast("참여할 방 정보가 없습니다.");
      return;
    }

    const nickname = els.nicknameInput.value.trim() || randomNickname();

    try {
      const { error } = await client.rpc("balance_join_room", {
        p_room_id: roomId,
        p_client_id: clientId,
        p_nickname: nickname,
      });
      if (error) throw error;

      localStorage.setItem(nicknameKey(), nickname);
      localStorage.setItem(joinedKey(), "1");
      await subscribeRoom();
      await broadcastUpdate();
      renderParticipant();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function startQuestion(event) {
    event.preventDefault();

    try {
      const { error } = await client.rpc("balance_start_question", {
        p_room_id: roomId,
        p_host_key: hostKey,
        p_question: els.questionInput.value,
        p_option_a: els.optionAInput.value,
        p_option_b: els.optionBInput.value,
      });
      if (error) throw error;

      await broadcastUpdate();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function closeQuestion() {
    try {
      const { error } = await client.rpc("balance_close_question", {
        p_room_id: roomId,
        p_host_key: hostKey,
      });
      if (error) throw error;

      await broadcastUpdate();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function prepareNext() {
    try {
      const { error } = await client.rpc("balance_prepare_next", {
        p_room_id: roomId,
        p_host_key: hostKey,
      });
      if (error) throw error;

      els.questionInput.value = "";
      els.optionAInput.value = "";
      els.optionBInput.value = "";
      els.presetSelect.value = "";
      await broadcastUpdate();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function endGame() {
    try {
      const { error } = await client.rpc("balance_end_game", {
        p_room_id: roomId,
        p_host_key: hostKey,
      });
      if (error) throw error;

      await broadcastUpdate();
    } catch (error) {
      if (String(error.message).includes("balance_end_game")) {
        showToast("Supabase에 종료 기능 SQL을 먼저 적용해 주세요.");
      } else {
        showToast(error.message);
      }
    }
  }

  async function submitAnswer() {
    if (!selectedChoice) {
      showToast("A 또는 B 중 하나를 선택해 주세요.");
      return;
    }

    try {
      const { error } = await client.rpc("balance_respond", {
        p_room_id: roomId,
        p_client_id: clientId,
        p_choice: selectedChoice,
        p_reason: els.reasonInput.value,
      });
      if (error) throw error;

      await broadcastUpdate();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openDetails() {
    try {
      const { data, error } = await client.rpc("balance_room_details", {
        p_room_id: roomId,
        p_host_key: role === "host" ? hostKey : null,
      });
      if (error) throw error;

      $("detailsTitle").textContent = data.question?.text || "닉네임과 선택 이유";

      if (!data.rows?.length) {
        els.detailsRows.innerHTML = `<p class="muted-text">제출된 응답이 없습니다.</p>`;
      } else {
        els.detailsRows.innerHTML = data.rows
          .map(
            (row) => `
              <article class="detail-row">
                <strong>${escapeHtml(row.nickname)}</strong>
                <span>${row.choice}. ${escapeHtml(row.choiceLabel)}</span>
                <p>${escapeHtml(row.reason || "이유 미작성")}</p>
              </article>
            `,
          )
          .join("");
      }

      els.detailsModal.classList.remove("hidden");
    } catch (error) {
      showToast(error.message);
    }
  }

  function closeDetails() {
    els.detailsModal.classList.add("hidden");
  }

  function applyPreset() {
    const preset = presets[Number(els.presetSelect.value)];
    if (!preset) return;

    els.questionInput.value = preset.question;
    els.optionAInput.value = preset.optionA;
    els.optionBInput.value = preset.optionB;
  }

  function selectChoice(choice) {
    selectedChoice = choice;
    updateChoiceButtons();
  }

  function updateChoiceButtons() {
    els.choiceAButton.classList.toggle("selected", selectedChoice === "A");
    els.choiceBButton.classList.toggle("selected", selectedChoice === "B");
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(els.shareLinkInput.value);
      showToast("참여 링크를 복사했습니다.");
    } catch {
      els.shareLinkInput.select();
      document.execCommand("copy");
      showToast("참여 링크를 복사했습니다.");
    }
  }

  function resultGraphHtml(results) {
    const options = results.options || [];
    const total = Number(results.total || options.reduce((sum, option) => sum + Number(option.count || 0), 0));

    if (!options.length || total <= 0) {
      return `<p class="muted-text">아직 제출된 응답이 없습니다.</p>`;
    }

    const gradient = pieGradient(options);
    const ariaLabel = options
      .map((option) => `${option.key}. ${option.label} ${option.count}명 ${option.percent}%`)
      .join(", ");
    const legend = options
      .map(
        (option, index) => `
          <div class="pie-legend-row">
            <span class="pie-swatch" style="background: ${pieColors[index % pieColors.length]}"></span>
            <div>
              <strong>${escapeHtml(option.key)}. ${escapeHtml(option.label)}</strong>
              <span>${option.count}명 · ${option.percent}%</span>
            </div>
          </div>
        `,
      )
      .join("");

    return `
      <div class="pie-result" role="img" aria-label="${escapeHtml(`응답 결과: ${ariaLabel}`)}">
        <div class="pie-chart" style="background: ${gradient}">
          <div class="pie-center">
            <strong>${total}</strong>
            <span>명 응답</span>
          </div>
        </div>
        <div class="pie-legend">${legend}</div>
      </div>
    `;
  }

  function renderResultGraph(container, results) {
    container.innerHTML = resultGraphHtml(results || { options: [] });
  }

  function pieGradient(options) {
    let cursor = 0;
    const parts = options.map((option, index) => {
      const start = cursor;
      const percent = Math.max(0, Number(option.percent || 0));
      const end = index === options.length - 1 ? 100 : Math.min(100, cursor + percent);
      cursor = end;
      return `${pieColors[index % pieColors.length]} ${start}% ${end}%`;
    });

    return `conic-gradient(${parts.join(", ")})`;
  }

  async function downloadHistoryImage() {
    if (!historyState?.rounds?.length && !historyLoading) {
      await loadHistory({ silent: true, force: true });
    }

    const rounds = historyState?.rounds || [];
    if (!rounds.length) {
      showToast(historyError || "다운로드할 누적 현황이 없습니다.");
      return;
    }

    const canvas = createHistoryCanvas(rounds);
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast("이미지를 만들지 못했습니다.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `balance-game-${roomId}-history.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function createHistoryCanvas(rounds) {
    const scale = 2;
    const width = 1200;
    const margin = 56;
    const cardPadding = 28;
    const contentWidth = width - margin * 2;
    const textWidth = contentWidth - cardPadding * 2;
    const measureCanvas = document.createElement("canvas");
    const measure = measureCanvas.getContext("2d");
    const fonts = {
      title: "800 44px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
      subtitle: "700 20px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
      round: "900 24px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
      question: "800 30px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
      body: "600 21px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
      small: "600 17px Pretendard, Malgun Gothic, Segoe UI, sans-serif",
    };

    const prepared = rounds.map((round) => {
      const question = round.question || {};
      const questionLines = wrapCanvasText(measure, question.text || "질문 없음", textWidth, fonts.question);
      const detailRows = (round.rows || []).map((row) => {
        const text = `${row.nickname || "익명"} · ${row.choice || ""}. ${row.choiceLabel || ""} · ${row.reason || "이유 미작성"}`;
        return wrapCanvasText(measure, text, textWidth, fonts.body);
      });
      const detailHeight = detailRows.length
        ? detailRows.reduce((sum, lines) => sum + Math.max(lines.length, 1) * 28 + 12, 0)
        : 34;
      const height = 34 + questionLines.length * 36 + 28 + 186 + 22 + detailHeight + cardPadding * 2;

      return { round, questionLines, detailRows, height };
    });

    const totalResponses = rounds.reduce((sum, round) => sum + (round.results?.total || 0), 0);
    const height = margin + 92 + 36 + prepared.reduce((sum, item) => sum + item.height + 22, 0) + margin;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#fbfdff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#111827";
    ctx.font = fonts.title;
    ctx.fillText("밸런스 게임 누적 현황", margin, margin + 42);
    ctx.fillStyle = "#64717f";
    ctx.font = fonts.subtitle;
    ctx.fillText(`방 ${roomId} · 질문 ${rounds.length}개 · 누적 응답 ${totalResponses}명`, margin, margin + 80);

    let y = margin + 120;
    prepared.forEach((item) => {
      const { round, questionLines, detailRows } = item;
      const results = round.results || { options: [] };

      drawRoundRect(ctx, margin, y, contentWidth, item.height, 18, "#ffffff", "#dce5f0");

      let innerY = y + cardPadding;
      ctx.fillStyle = "#0f9f6e";
      ctx.font = fonts.round;
      ctx.fillText(`Q${round.roundNumber || ""}`, margin + cardPadding, innerY + 24);

      ctx.fillStyle = "#111827";
      ctx.font = fonts.question;
      innerY += 44;
      questionLines.forEach((line) => {
        ctx.fillText(line, margin + cardPadding, innerY);
        innerY += 36;
      });

      innerY += 12;
      drawCanvasPieResult(ctx, margin + cardPadding, innerY, textWidth, results, fonts);
      innerY += 186;

      innerY += 12;
      ctx.fillStyle = "#111827";
      ctx.font = fonts.small;
      ctx.fillText("세부 현황", margin + cardPadding, innerY);
      innerY += 30;

      ctx.fillStyle = "#263241";
      ctx.font = fonts.body;
      if (!detailRows.length) {
        ctx.fillText("제출된 응답이 없습니다.", margin + cardPadding, innerY);
      } else {
        detailRows.forEach((lines) => {
          lines.forEach((line) => {
            ctx.fillText(line, margin + cardPadding, innerY);
            innerY += 28;
          });
          innerY += 12;
        });
      }

      y += item.height + 22;
    });

    return canvas;
  }

  function wrapCanvasText(ctx, text, maxWidth, font) {
    ctx.font = font;
    const chars = Array.from(String(text || ""));
    const lines = [];
    let line = "";

    chars.forEach((char) => {
      const testLine = line + char;
      if (line && ctx.measureText(testLine).width > maxWidth) {
        lines.push(line);
        line = char.trimStart();
      } else {
        line = testLine;
      }
    });

    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke = "") {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawCanvasPieResult(ctx, x, y, width, results, fonts) {
    const options = results.options || [];
    const total = Number(results.total || options.reduce((sum, option) => sum + Number(option.count || 0), 0));
    const radius = 76;
    const centerX = x + radius;
    const centerY = y + radius;
    const legendX = x + radius * 2 + 34;
    let legendY = y + 32;

    if (!options.length || total <= 0) {
      drawRoundRect(ctx, x, y + 18, width, 92, 16, "#f1f5f9", "#dce5f0");
      ctx.fillStyle = "#64717f";
      ctx.font = fonts.body;
      ctx.fillText("아직 제출된 응답이 없습니다.", x + 22, y + 74);
      return;
    }

    let startAngle = -Math.PI / 2;
    options.forEach((option, index) => {
      const isLast = index === options.length - 1;
      const angle = isLast ? Math.PI * 1.5 : startAngle + (Number(option.percent || 0) / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, angle);
      ctx.closePath();
      ctx.fillStyle = pieColors[index % pieColors.length];
      ctx.fill();
      startAngle = angle;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, 42, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.font = "900 30px Pretendard, Malgun Gothic, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(total), centerX, centerY - 2);
    ctx.fillStyle = "#64717f";
    ctx.font = fonts.small;
    ctx.fillText("명 응답", centerX, centerY + 24);
    ctx.textAlign = "left";

    options.forEach((option, index) => {
      ctx.beginPath();
      ctx.arc(legendX + 10, legendY - 8, 9, 0, Math.PI * 2);
      ctx.fillStyle = pieColors[index % pieColors.length];
      ctx.fill();

      ctx.fillStyle = "#263241";
      ctx.font = fonts.body;
      ctx.fillText(`${option.key}. ${option.label}`, legendX + 30, legendY);
      ctx.fillStyle = "#64717f";
      ctx.font = fonts.small;
      ctx.fillText(`${option.count}명 · ${option.percent}%`, legendX + 30, legendY + 28);
      legendY += 62;
    });
  }

  function renderQr(text) {
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
    els.qrCode.innerHTML = `<img src="${src}" alt="참여 링크 QR 코드" />`;
  }

  function appBaseUrl() {
    const configured = String(config.PUBLIC_URL || "").trim().replace(/\/+$/, "");
    if (configured) return configured;

    return window.location.href
      .split("#")[0]
      .split("?")[0]
      .replace(/\/index\.html$/i, "")
      .replace(/\/+$/, "");
  }

  function syncSound() {
    if (!state) {
      soundEngine.setMode("none");
      return;
    }

    if (role === "participant" && localStorage.getItem(joinedKey()) !== "1") {
      soundEngine.setMode("none");
      return;
    }

    const submittedCurrentQuestion =
      role === "participant" && state.userResponse?.questionId && state.userResponse.questionId === state.question?.id;

    if (state.status === "active") {
      soundEngine.setMode(submittedCurrentQuestion ? "peaceful" : "tense");
      return;
    }

    if (state.status === "waiting" || state.status === "closed") {
      soundEngine.setMode("peaceful");
      return;
    }

    soundEngine.setMode("none");
  }

  function createSoundEngine() {
    let context = null;
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;
    let musicTimer = null;
    let requestedMode = "none";
    let activeMode = "none";
    let step = 0;
    let muted = localStorage.getItem("balanceGameSound") === "off";

    updateSoundButton();

    function setup() {
      if (context) return;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      context = new AudioContext();
      masterGain = context.createGain();
      musicGain = context.createGain();
      sfxGain = context.createGain();

      masterGain.gain.value = muted ? 0 : 0.82;
      musicGain.gain.value = 7.2;
      sfxGain.gain.value = 0.56;

      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(context.destination);
    }

    function unlock() {
      setup();
      if (!context) return;

      if (context.state === "suspended") {
        context.resume();
      }

      if (!muted) startMode(requestedMode);
    }

    function setMode(mode) {
      requestedMode = mode;
      if (mode === "none") {
        stopMusic();
        return;
      }

      if (!context || muted) return;
      startMode(mode);
    }

    function startMode(mode) {
      if (!context || muted || activeMode === mode) return;

      stopMusic();
      activeMode = mode;
      step = 0;

      if (mode === "tense") {
        runTenseStep();
        musicTimer = window.setInterval(runTenseStep, 120);
      } else if (mode === "peaceful") {
        runPeacefulStep();
        musicTimer = window.setInterval(runPeacefulStep, 1800);
      }
    }

    function stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
      activeMode = "none";
    }

    function runTenseStep() {
      const notes = [110, 130.81, 146.83, 164.81, 196, 185, 146.83, 130.81];
      const note = notes[step % notes.length];

      playTone(note, "sawtooth", 0.12, 0.035, 0, musicGain);
      playTone(note * 2, "square", 0.08, 0.012, 0.015, musicGain);

      if (step % 4 === 0) playKick();
      if (step % 2 === 1) playNoise(0.035, 0.018, 0, 5200);

      step += 1;
    }

    function runPeacefulStep() {
      const chords = [
        [196, 246.94, 329.63],
        [174.61, 220, 293.66],
        [207.65, 261.63, 329.63],
        [164.81, 246.94, 329.63],
      ];
      const chord = chords[step % chords.length];

      chord.forEach((frequency, index) => {
        playTone(frequency, "sine", 1.65, 0.018, index * 0.045, musicGain);
      });
      playTone(chord[2] * 2, "triangle", 0.46, 0.016, 0.42, musicGain);

      step += 1;
    }

    function playClick() {
      unlock();
      if (!context || muted) return;

      playTone(620, "triangle", 0.075, 0.045, 0, sfxGain, 0.64);
      playTone(930, "sine", 0.06, 0.018, 0.03, sfxGain);
    }

    function playKick() {
      if (!context) return;

      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(88, start);
      oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.16);

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      oscillator.connect(gain);
      gain.connect(musicGain);
      oscillator.start(start);
      oscillator.stop(start + 0.19);
    }

    function playNoise(duration, amount, delay, cutoff) {
      if (!context) return;

      const start = context.currentTime + delay;
      const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }

      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();

      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.value = cutoff;
      gain.gain.setValueAtTime(amount, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      source.start(start);
      source.stop(start + duration);
    }

    function playTone(frequency, type, duration, amount, delay, destination, glideRatio = 1) {
      if (!context || !destination) return;

      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (glideRatio !== 1) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * glideRatio), start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(amount, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    function toggleMuted() {
      setup();
      muted = !muted;
      localStorage.setItem("balanceGameSound", muted ? "off" : "on");
      updateSoundButton();

      if (!context) return;

      masterGain.gain.setTargetAtTime(muted ? 0 : 0.82, context.currentTime, 0.03);
      if (muted) {
        stopMusic();
      } else {
        unlock();
        startMode(requestedMode);
      }
    }

    function updateSoundButton() {
      els.soundToggleBtn.setAttribute("aria-pressed", String(!muted));
      els.soundToggleBtn.title = muted ? "사운드 꺼짐" : "사운드 켜짐";
      els.soundToggleBtn.querySelector("span").textContent = muted ? "×" : "♪";
    }

    return {
      playClick,
      setMode,
      toggleMuted,
      unlock,
    };
  }

  function statusText(status) {
    if (status === "active") return "응답 진행 중";
    if (status === "closed") return "결과 공개";
    if (status === "ended") return "게임 종료";
    return "대기 중";
  }

  function randomNickname() {
    const words = ["민트", "라임", "코발트", "햇살", "파도", "소금", "모카", "노을"];
    const word = words[Math.floor(Math.random() * words.length)];
    const number = Math.floor(100 + Math.random() * 900);
    return `${word}${number}`;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2400);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
