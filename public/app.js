// ==========================================================
// JIZURA VIDEO STUDIO - FRONTEND APPLICATION SCRIPT
// ==========================================================

const state = {
  videoPath: null,       // ローカルパス（サーバー側処理用）
  mediaUrl: null,        // ブラウザ再生用URL (/media/uploads/...)
  selectedStyle: null,   // 選択中スタイル名
  videoDuration: 0,      // 動画の長さ（秒）
  presets: null,
  overlayPosition: "bottom",
  overlayScale: 0.65,
  overlayYOffset: 40,
};

// DOM 要素
const elements = {
  tabYt: document.getElementById("tab-yt"),
  tabFile: document.getElementById("tab-file"),
  panelYt: document.getElementById("panel-yt"),
  panelFile: document.getElementById("panel-file"),
  inputYtUrl: document.getElementById("input-yt-url"),
  btnFetchYt: document.getElementById("btn-fetch-yt"),
  spinnerYt: document.getElementById("spinner-yt"),
  fileDropzone: document.getElementById("video-dropzone"),
  fileInput: document.getElementById("file-input"),
  metaCard: document.getElementById("video-meta-card"),
  metaThumb: document.getElementById("meta-thumb"),
  metaTitle: document.getElementById("meta-title"),
  metaDuration: document.getElementById("meta-duration"),
  metaAuthor: document.getElementById("meta-author"),
  mainVideo: document.getElementById("main-video"),
  playerPlaceholder: document.getElementById("player-placeholder"),
  btnPlayPause: document.getElementById("btn-play-pause"),
  timeDisplay: document.getElementById("time-display"),
  seekBar: document.getElementById("seek-bar"),
  btnInsertTimestamp: document.getElementById("btn-insert-timestamp"),
  trimStart: document.getElementById("trim-start"),
  trimDuration: document.getElementById("trim-duration"),
  btnApplyTrim: document.getElementById("btn-apply-trim"),
  inputTitle: document.getElementById("input-title"),
  inputArtist: document.getElementById("input-artist"),
  inputLyrics: document.getElementById("input-lyrics"),
  syntaxBar: document.getElementById("syntax-bar"),
  styleGrid: document.getElementById("style-grid"),
  btnStyleRandom: document.getElementById("btn-style-random"),
  btnStyleShuffle: document.getElementById("btn-style-shuffle"),
  checkHideFrame: document.getElementById("check-hide-frame"),
  selectRenderMode: document.getElementById("select-render-mode"),
  btnPreview: document.getElementById("btn-preview"),
  btnRender: document.getElementById("btn-render"),
  btnQuickSample: document.getElementById("btn-quick-sample"),
  groupPosition: document.getElementById("group-position"),
  groupScale: document.getElementById("group-scale"),
  sliderYOffset: document.getElementById("slider-y-offset"),
  offsetVal: document.getElementById("offset-val"),
  // モーダル要素
  resultModal: document.getElementById("result-modal"),
  modalTitle: document.getElementById("modal-title"),
  btnCloseModal: document.getElementById("btn-close-modal"),
  btnModalDismiss: document.getElementById("btn-modal-dismiss"),
  modalLoader: document.getElementById("modal-loader"),
  loaderStatus: document.getElementById("loader-status"),
  modalPreviewBox: document.getElementById("modal-preview-box"),
  modalPreviewImg: document.getElementById("modal-preview-img"),
  modalVideoBox: document.getElementById("modal-video-box"),
  modalVideo: document.getElementById("modal-video"),
  btnModalDownload: document.getElementById("btn-modal-download"),
};

// 初期化
async function init() {
  bindEvents();
  await loadPresets();
}

// プリセット一覧のロード
async function loadPresets() {
  try {
    const res = await fetch("/api/presets");
    state.presets = await res.json();
    renderSyntaxBar(state.presets.syntaxHelpers);
    renderStyleGrid(state.presets.styles);
  } catch (err) {
    console.error("プリセット読み込み失敗:", err);
  }
}

// 記法クイックタグの描画
function renderSyntaxBar(helpers) {
  elements.syntaxBar.innerHTML = "";
  helpers.forEach((h) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "syntax-tag-btn";
    btn.textContent = h.label;
    btn.title = `${h.syntax} (${h.desc})`;
    btn.addEventListener("click", () => insertSyntax(h));
    elements.syntaxBar.appendChild(btn);
  });
}

// 選択中のテキストに記法を適用
function insertSyntax(helper) {
  const ta = elements.inputLyrics;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.substring(start, end);
  let replacement = "";

  if (helper.label.includes("強調")) {
    replacement = `*${selected || "強調歌詞"}*`;
  } else if (helper.label.includes("ささやき")) {
    replacement = `~${selected || "ささやき歌詞"}~`;
  } else if (helper.label.includes("カット")) {
    replacement = selected ? `${selected} / ` : "/ ";
  } else if (helper.label.includes("フラッシュ")) {
    replacement = `${selected || "盛り上がる歌詞"}!`;
  } else if (helper.label.includes("重ねて")) {
    replacement = `{\n${selected || "一行目\n二行目"}\n}`;
  } else if (helper.label.includes("タイムスタンプ")) {
    const timeStr = formatLrcTime(elements.mainVideo.currentTime || 0);
    replacement = `[${timeStr}]${selected}`;
  } else {
    replacement = helper.syntax;
  }

  ta.setRangeText(replacement, start, end, "end");
  ta.focus();
}

// スタイルプリセットグリッドの描画
function renderStyleGrid(styles) {
  elements.styleGrid.innerHTML = "";
  styles.forEach((style, index) => {
    const card = document.createElement("div");
    card.className = "style-card";
    if (index === 0) {
      card.classList.add("selected");
      state.selectedStyle = style.name;
    }
    card.innerHTML = `
      <span class="style-name">${escapeHtml(style.name)}</span>
      <span class="style-desc">${escapeHtml(style.desc)}</span>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".style-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      state.selectedStyle = style.name;
    });
    elements.styleGrid.appendChild(card);
  });
}

// イベントバインド
function bindEvents() {
  // タブ切り替え
  elements.tabYt.addEventListener("click", () => switchTab("panel-yt", elements.tabYt));
  elements.tabFile.addEventListener("click", () => switchTab("panel-file", elements.tabFile));

  // YouTube動画取得
  elements.btnFetchYt.addEventListener("click", handleFetchYoutube);
  elements.inputYtUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleFetchYoutube();
  });

  // ファイルアップロード（D&D & クリック）
  elements.fileDropzone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) handleUploadFile(e.target.files[0]);
  });
  elements.fileDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    elements.fileDropzone.classList.add("dragover");
  });
  elements.fileDropzone.addEventListener("dragleave", () => {
    elements.fileDropzone.classList.remove("dragover");
  });
  elements.fileDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    elements.fileDropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  });

  // プレイヤー操作
  elements.btnPlayPause.addEventListener("click", togglePlay);
  elements.mainVideo.addEventListener("timeupdate", updatePlayerProgress);
  elements.mainVideo.addEventListener("loadedmetadata", onVideoLoaded);
  elements.seekBar.addEventListener("input", (e) => {
    if (state.videoDuration > 0) {
      elements.mainVideo.currentTime = (e.target.value / 100) * state.videoDuration;
    }
  });

  // タイムスタンプ挿入
  elements.btnInsertTimestamp.addEventListener("click", () => {
    const timeStr = formatLrcTime(elements.mainVideo.currentTime || 0);
    const ta = elements.inputLyrics;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.setRangeText(`[${timeStr}]`, start, end, "end");
    ta.focus();
  });

  // トリミング適用
  elements.btnApplyTrim.addEventListener("click", handleTrimVideo);

  // ランダムスタイル
  elements.btnStyleRandom.addEventListener("click", () => {
    const cards = document.querySelectorAll(".style-card");
    if (!cards.length) return;
    const randomIndex = Math.floor(Math.random() * cards.length);
    cards.forEach((c) => c.classList.remove("selected"));
    cards[randomIndex].classList.add("selected");
    state.selectedStyle = state.presets.styles[randomIndex].name;
  });

  // シャッフル
  elements.btnStyleShuffle.addEventListener("click", () => {
    state.selectedStyle = null; // nullでサーバー側が「シャッフル」を実行
    document.querySelectorAll(".style-card").forEach((c) => c.classList.remove("selected"));
    alert("「シャッフル」演出モードに設定しました（プレビュー時に自動シャッフルされます）");
  });

  // サンプル読込
  elements.btnQuickSample.addEventListener("click", loadSampleData);

  // プレビュー生成
  elements.btnPreview.addEventListener("click", handleGeneratePreview);

  // テロップ配置位置切り替え
  elements.groupPosition?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-toggle");
    if (!btn) return;
    elements.groupPosition.querySelectorAll(".btn-toggle").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.overlayPosition = btn.dataset.pos;
  });

  // スケール切り替え
  elements.groupScale?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-toggle");
    if (!btn) return;
    elements.groupScale.querySelectorAll(".btn-toggle").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.overlayScale = parseFloat(btn.dataset.scale);
  });

  // 縦オフセット微調整
  elements.sliderYOffset?.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.overlayYOffset = val;
    if (elements.offsetVal) {
      elements.offsetVal.textContent = (val > 0 ? "+" : "") + val + "px";
    }
  });

  // 動画書き出し
  elements.btnRender.addEventListener("click", handleRenderVideo);

  // モーダル閉じる
  elements.btnCloseModal.addEventListener("click", closeModal);
  elements.btnModalDismiss.addEventListener("click", closeModal);
}

// タブ切り替え
function switchTab(targetId, activeBtn) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  activeBtn.classList.add("active");
  document.getElementById(targetId).classList.add("active");
}

// YouTube動画の取得
async function handleFetchYoutube() {
  const url = elements.inputYtUrl.value.trim();
  if (!url) return alert("YouTube URLを入力してください");

  elements.btnFetchYt.disabled = true;
  elements.spinnerYt.classList.remove("hidden");
  elements.btnFetchYt.querySelector(".btn-text").textContent = "DL中...";

  try {
    const res = await fetch("/api/youtube/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "ダウンロード失敗");

    // 成功
    setLoadedVideo(data.mediaUrl, data.filePath, data.metadata);
  } catch (err) {
    alert("YouTube動画の取得に失敗しました: " + err.message);
  } finally {
    elements.btnFetchYt.disabled = false;
    elements.spinnerYt.classList.add("hidden");
    elements.btnFetchYt.querySelector(".btn-text").textContent = "動画を取得";
  }
}

// ローカルファイルアップロード
async function handleUploadFile(file) {
  const formData = new FormData();
  formData.append("video", file);

  const prevText = elements.fileDropzone.querySelector(".drop-main").textContent;
  elements.fileDropzone.querySelector(".drop-main").textContent = "アップロード中...";

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "アップロード失敗");

    setLoadedVideo(data.mediaUrl, data.filePath, {
      title: file.name,
      duration: 0,
      uploader: "ローカルファイル",
    });
  } catch (err) {
    alert("ファイルのアップロードに失敗しました: " + err.message);
  } finally {
    elements.fileDropzone.querySelector(".drop-main").textContent = prevText;
  }
}

// 読み込まれた動画をセット
function setLoadedVideo(mediaUrl, filePath, metadata) {
  state.mediaUrl = mediaUrl;
  state.videoPath = filePath;

  elements.mainVideo.src = mediaUrl;
  elements.playerPlaceholder.classList.add("hidden");
  elements.btnPlayPause.disabled = false;
  elements.seekBar.disabled = false;
  elements.btnInsertTimestamp.disabled = false;
  elements.btnApplyTrim.disabled = false;

  // メタデータバー更新
  if (metadata) {
    elements.metaCard.classList.remove("hidden");
    elements.metaTitle.textContent = metadata.title || "動画";
    elements.metaAuthor.textContent = metadata.uploader || "Unknown";
    if (metadata.thumbnail) {
      elements.metaThumb.src = metadata.thumbnail;
      elements.metaThumb.classList.remove("hidden");
    } else {
      elements.metaThumb.classList.add("hidden");
    }
    // 曲名入力欄に初期反映
    if (!elements.inputTitle.value) {
      elements.inputTitle.value = metadata.title || "";
    }
  }
}

// 動画読み込み完了時の処理
function onVideoLoaded() {
  state.videoDuration = elements.mainVideo.duration || 0;
  elements.metaDuration.textContent = formatTime(state.videoDuration);
  updateTimeDisplay();
}

// プレイヤートグル
function togglePlay() {
  if (elements.mainVideo.paused) {
    elements.mainVideo.play();
    elements.btnPlayPause.textContent = "⏸";
  } else {
    elements.mainVideo.pause();
    elements.btnPlayPause.textContent = "▶";
  }
}

// プログレス更新
function updatePlayerProgress() {
  if (state.videoDuration > 0) {
    elements.seekBar.value = (elements.mainVideo.currentTime / state.videoDuration) * 100;
  }
  updateTimeDisplay();
}

function updateTimeDisplay() {
  const cur = formatLrcTime(elements.mainVideo.currentTime || 0);
  const dur = formatLrcTime(state.videoDuration || 0);
  elements.timeDisplay.textContent = `${cur} / ${dur}`;
}

// トリミング
async function handleTrimVideo() {
  if (!state.videoPath) return;
  const startSec = Number(elements.trimStart.value) || 0;
  const durationSec = Number(elements.trimDuration.value) || undefined;

  elements.btnApplyTrim.disabled = true;
  elements.btnApplyTrim.textContent = "処理中...";

  try {
    const res = await fetch("/api/trim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: state.videoPath,
        startSec,
        durationSec,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setLoadedVideo(data.mediaUrl, data.filePath, {
      title: `トリミング済み動画 (${startSec}s〜)`,
      duration: durationSec || state.videoDuration - startSec,
      uploader: "Trimmed",
    });
    alert("トリミング動画を適用しました。");
  } catch (e) {
    alert("トリミング失敗: " + e.message);
  } finally {
    elements.btnApplyTrim.disabled = false;
    elements.btnApplyTrim.textContent = "切り出し適用";
  }
}

// サンプルデータ流し込み
function loadSampleData() {
  elements.inputTitle.value = "夜明けのメロディ";
  elements.inputArtist.value = "JIZURA STUDIO";
  elements.inputLyrics.value = `[00:00.50]夜明けの色を/覚えてる
[00:02.00]ほどけた声が遠くで鳴った
[00:03.50]ねえ、まだ間に合うかな
[00:04.20]*透明なままじゃ終われない!*`;

  // サンプル動画が未選択の場合はセット
  if (!state.videoPath) {
    setLoadedVideo("/media/uploads/sample_test.mp4", "./uploads/sample_test.mp4", {
      title: "夜明けのメロディ (Demo Video)",
      duration: 5,
      uploader: "JIZURA STUDIO",
    });
  }

  // ノワールまたはダークHUDを選択
  if (state.presets && state.presets.styles.length > 1) {
    state.selectedStyle = state.presets.styles[1].name; // ダークHUD
    document.querySelectorAll(".style-card").forEach((c, idx) => {
      c.classList.toggle("selected", idx === 1);
    });
  }
}

// プレビュー生成
async function handleGeneratePreview() {
  const lyrics = elements.inputLyrics.value.trim();
  if (!lyrics) return alert("歌詞を入力してください");

  openModal("JIZURA プレビュー生成", true, "PlaywrightでJIZURAレンダリング中...");

  try {
    const res = await fetch("/api/jizura/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lyrics,
        title: elements.inputTitle.value.trim(),
        artist: elements.inputArtist.value.trim(),
        styleName: state.selectedStyle,
        videoPath: state.videoPath,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "プレビュー生成失敗");

    // 画像表示
    elements.modalLoader.classList.add("hidden");
    elements.modalPreviewBox.classList.remove("hidden");
    elements.modalPreviewImg.src = data.dataUrl;
    elements.btnModalDownload.classList.add("hidden");
  } catch (err) {
    closeModal();
    alert("プレビュー生成に失敗しました: " + err.message);
  }
}

// 動画レンダリング＆書き出し
async function handleRenderVideo() {
  const lyrics = elements.inputLyrics.value.trim();
  if (!lyrics) return alert("歌詞を入力してください");

  const mode = elements.selectRenderMode.value;
  openModal("動画レンダリング & 書き出し", true, "JIZURAでMP4を書き出しています（1〜2分程度かかります）...");

  try {
    const res = await fetch("/api/jizura/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lyrics,
        title: elements.inputTitle.value.trim(),
        artist: elements.inputArtist.value.trim(),
        styleName: state.selectedStyle,
        videoPath: state.videoPath,
        mode,
        overlayPosition: state.overlayPosition,
        overlayScale: state.overlayScale,
        overlayYOffset: state.overlayYOffset,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "書き出し失敗");

    // 完成動画プレイヤー表示
    elements.modalLoader.classList.add("hidden");
    elements.modalVideoBox.classList.remove("hidden");
    elements.modalVideo.src = data.videoUrl;
    elements.modalVideo.play().catch(() => {});

    // ダウンロードボタン
    elements.btnModalDownload.href = data.videoUrl;
    elements.btnModalDownload.download = data.filename || "jizura_video.mp4";
    elements.btnModalDownload.classList.remove("hidden");
  } catch (err) {
    closeModal();
    alert("動画の書き出しに失敗しました: " + err.message);
  }
}

// モーダル操作
function openModal(title, showLoader, statusText = "") {
  elements.modalTitle.textContent = title;
  elements.resultModal.classList.remove("hidden");
  elements.modalPreviewBox.classList.add("hidden");
  elements.modalVideoBox.classList.add("hidden");
  elements.btnModalDownload.classList.add("hidden");

  if (showLoader) {
    elements.modalLoader.classList.remove("hidden");
    elements.loaderStatus.textContent = statusText;
  } else {
    elements.modalLoader.classList.add("hidden");
  }
}

function closeModal() {
  elements.resultModal.classList.add("hidden");
  if (elements.modalVideo) elements.modalVideo.pause();
}

// ユーティリティ
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatLrcTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(5, "0")}`;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// スタート
init();
