// Firebase SDKから必要な関数をインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1Cht_x003ZMPdZQRBddjnP2dbqWLbKPM",
  authDomain: "mobi-69fb2.firebaseapp.com",
  databaseURL: "https://mobi-69fb2-default-rtdb.firebaseio.com",
  projectId: "mobi-69fb2",
  storageBucket: "mobi-69fb2.appspot.com",
  messagingSenderId: "595370829334",
  appId: "1:595370829334:web:5af14c31b140e9328af737",
  measurementId: "G-Q8T5QB54WQ"
};


// --- DOM要素の取得 ---
const timerDisplay = document.getElementById('timer');
const titleDisplay = document.getElementById('title');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const container = document.body;

// --- グローバル変数 ---
let latestData = null; // Firebaseから取得した最新のデータ
let currentSettings = {}; // 現在適用されているデザイン設定
let animationFrameId = null; // アニメーションフレームID

// --- 初期化処理 ---
function initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');

    if (!sessionId) {
        displayError("連携IDがURLに含まれていません。OBS用のURLを再生成してください。");
        return;
    }

    try {
        const firebaseApp = initializeApp(firebaseConfig);
        const db = getDatabase(firebaseApp);
        const dbRef = ref(db, `timers/${sessionId}`);

        onValue(dbRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                latestData = data;
                // designSettingsが存在すれば、まず適用する
                if (data.designSettings) {
                    applySettings(data.designSettings);
                }
            } else {
                latestData = null;
                displayError("拡張機能との接続が切れました。");
            }
        });

        animationLoop();

    } catch (e) {
        console.error("Firebaseの初期化に失敗しました。", e);
        displayError("Firebaseの初期化に失敗しました。設定を確認してください。");
    }
}

// エラーメッセージを表示する関数
function displayError(message) {
    titleDisplay.textContent = "エラー";
    timerDisplay.textContent = message;
    timerDisplay.style.fontSize = "20px";
    progressContainer.style.display = "none";
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

// デザイン設定を適用する関数
function applySettings(settings) {
    currentSettings = settings;
    container.style.backgroundColor = settings.bgColor;
    titleDisplay.style.fontFamily = settings.titleFont;
    titleDisplay.style.fontWeight = settings.titleWeight;
    titleDisplay.style.color = settings.titleColor;
    titleDisplay.style.fontSize = `${settings.titleSize}px`;
    timerDisplay.style.fontFamily = settings.timerFont;
    timerDisplay.style.fontWeight = settings.timerWeight;
    timerDisplay.style.color = settings.timerColor;
    timerDisplay.style.fontSize = `${settings.timerSize}px`;
    const shadow = settings.shadowVisible ? `2px 2px ${settings.shadowBlur}px ${settings.shadowColor}` : 'none';
    titleDisplay.style.textShadow = shadow;
    timerDisplay.style.textShadow = shadow;
    progressContainer.style.height = `${settings.progressBarHeight}px`;
}

// 時間をフォーマットする関数
function formatTime(totalSeconds, duration) {
    const isNegative = totalSeconds < 0;
    let displaySeconds = totalSeconds;

    if (isNegative) {
        displaySeconds = Math.ceil(Math.abs(totalSeconds));
    } else if (currentSettings.showRemainingTime && duration > 0) {
        displaySeconds = duration - totalSeconds;
    }

    if (displaySeconds < 0) displaySeconds = 0;

    const hours = Math.floor(displaySeconds / 3600);
    const minutes = Math.floor((displaySeconds % 3600) / 60);
    const seconds = Math.floor(displaySeconds % 60);
    const tenths = Math.floor((displaySeconds * 10) % 10);

    let timeString;
    switch (currentSettings.timerFormat) {
        case 'MM:SS':
            const totalMinutes = Math.floor(displaySeconds / 60);
            timeString = `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            break;
        case 'HH:MM:SS.L':
            timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
            break;
        case 'HH:MM:SS':
        default:
            timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            break;
    }
    return timeString;
}

// 色を補間する関数
function interpolateColor(color1, color2, factor) {
    factor = Math.max(0, Math.min(1, factor));
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);
    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);
    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 表示を更新するメインの関数
function updateDisplay() {
    if (!latestData || !latestData.videoState || !currentSettings) {
        // データがない場合、タイトルを非表示にしておく
        titleDisplay.style.display = 'none';
        return;
    }

    const { videoState, designSettings } = latestData;
    // designSettings があれば適用する
    if (designSettings) {
        applySettings(designSettings);
    }

    const { duration, isAd, adRemainingTime, isPlaying, lastUpdated, currentTime, title, seriesTitle, episodeInfo, episodeTitle, source } = videoState;
    
    // 時間の補間
    const elapsedTime = isPlaying ? (Date.now() - (lastUpdated || Date.now())) / 1000 : 0;
    let displayTime;
    let progressTime;

    if (isAd) {
        displayTime = -(adRemainingTime - elapsedTime);
        progressTime = currentTime + elapsedTime;
    } else {
        displayTime = currentTime + elapsedTime;
        progressTime = displayTime;
    }

    // オフセット適用
    if (displayTime >= 0 && !isAd) {
        const offset = parseFloat(currentSettings.timerOffset) || 0;
        displayTime += offset;
        progressTime += offset;
    }

    // ▼▼▼ ここから変更 ▼▼▼
    // UI更新
    let finalTitle = ''; // デフォルトを空文字列に
    // Netflixの場合、設定に基づいてタイトルを組み立てる
    if (source?.includes('www.netflix.com')) {
        const parts = [];
        if (currentSettings.netflixShowSeriesTitle && seriesTitle) {
            parts.push(seriesTitle);
        }
        if (currentSettings.netflixShowEpisodeInfo && episodeInfo) {
            parts.push(episodeInfo);
        }
        if (currentSettings.netflixShowEpisodeSubtitle && episodeTitle) {
            parts.push(episodeTitle);
        }
        finalTitle = parts.join(' ');
    } else {
        // Netflix以外は元のタイトルを使用
        finalTitle = title || '';
    }

    // タイトルが空か、設定で非表示の場合は表示しない
    const isTitleEffectivelyVisible = currentSettings.titleVisible && finalTitle.trim() !== '';
    titleDisplay.style.display = isTitleEffectivelyVisible ? 'block' : 'none';
    titleDisplay.textContent = finalTitle;
    // ▲▲▲ ここまで変更 ▲▲▲
    
    timerDisplay.style.color = displayTime < 0 ? currentSettings.countdownColor : (isAd ? currentSettings.adTimerColor : currentSettings.timerColor);
    timerDisplay.textContent = formatTime(displayTime, duration);

    // プログレスバー更新
    const showProgressBar = currentSettings.progressBarVisible;
    progressContainer.style.display = showProgressBar ? 'block' : 'none';
    if (showProgressBar) {
        const isAmazonAd = isAd && videoState.source && videoState.source.includes('amazon');
        const progress = isAmazonAd ? 100 : (duration > 0 && progressTime >= 0) ? Math.min((progressTime / duration) * 100, 100) : 0;
        progressBar.style.width = `${progress}%`;

        progressBar.style.backgroundColor = '';
        progressBar.style.background = '';
        progressBar.classList.remove('rainbow-animate');

        if (currentSettings.rainbowEffect) {
            progressBar.classList.add('rainbow-animate');
        } else if (currentSettings.gradientEnabled && progressTime >= 0) {
            const progressFactor = progressTime / duration;
            progressBar.style.backgroundColor = interpolateColor(currentSettings.progressBarColor, currentSettings.gradientEndColor, progressFactor);
        } else {
            progressBar.style.backgroundColor = currentSettings.progressBarColor;
        }
        progressBar.classList.toggle('sparkle', currentSettings.gradientSparkle);
    }
}

// アニメーションループ
function animationLoop() {
    updateDisplay();
    animationFrameId = requestAnimationFrame(animationLoop);
}

// 初期化関数を実行
initialize();
