// Firebase SDKから必要な関数をインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 開発者様へ: ご自身のFirebaseプロジェクトの設定情報に書き換えてください ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
const firebaseConfig = {
  // ユーザーから提供されたFirebaseプロジェクト設定
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

// 広告再生中の状態を管理するフラグ (viewer.jsに追加)
let adBreakInProgress = false; 

// --- 初期化処理 ---
function initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');

    // URLからconfigパラメータを削除し、sessionIdのみを必須とする
    if (!sessionId) {
        displayError("連携IDがURLに含まれていません。OBS用のURLを再生成してください。");
        return;
    }

    try {
        // ハードコードされた設定でFirebaseを初期化
        const firebaseApp = initializeApp(firebaseConfig);
        const db = getDatabase(firebaseApp);
        const dbRef = ref(db, `timers/${sessionId}`);

        // データの変更をリッスン
        onValue(dbRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // --- 広告再生状態の管理ロジック (viewer.jsに追加) ---
                // 広告が始まったか、続いているか
                if (data.videoState && data.videoState.isAd) {
                    adBreakInProgress = true;
                } 
                // 広告が終わったか
                else if (data.videoState && !data.videoState.isAd && adBreakInProgress) {
                    adBreakInProgress = false;
                    // 広告が終わった直後は、本編の正しい時間から再開するために
                    // 最後の更新時間(lastUpdated)を現在時刻にリセットする
                    data.videoState.lastUpdated = Date.now();
                }
                // --- 広告再生状態の管理ロジックここまで ---

                latestData = data;
                if (data.designSettings) {
                    applySettings(data.designSettings);
                }
            } else {
                latestData = null;
                displayError("拡張機能との接続が切れました。");
            }
        });

        // アニメーションループを開始
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
        return;
    }

    const { videoState } = latestData;
    const { duration, isAd, adRemainingTime, isPlaying, lastUpdated, currentTime, title } = videoState;
    
    // 時間の補間
    const elapsedTime = isPlaying ? (Date.now() - lastUpdated) / 1000 : 0;
    let displayTime;
    let progressTime;

    // isCountingDown の状態は viewer.js には直接伝わらないため、
    // isPlaying が false かつ currentTime が非常に小さい場合にカウントダウンとみなす
    // または、専用のフラグをFirebase経由で送る必要がある。
    // ここでは timer.js のロジックに近づけるため、isPlayingがfalseで、
    // かつ adBreakInProgress も false の場合にカウントダウンと仮定する。
    // ただし、正確なカウントダウンは timer.js 側で処理されるべきなので、
    // viewer.js では再生が止まっている状態を「カウントダウン中」として表現する。
    const isCountingDown = !isPlaying && !isAd && (currentTime === 0 || duration === 0); 
    let countdownEndTime = 0; // viewer.jsでは使用しないが、timer.jsとの整合性のため定義

    if (isCountingDown) {
        // timer.jsでは -delay で表示されるため、それに合わせる
        // ただし、viewer.jsではdelayの値が直接わからないため、
        // isPlayingがfalseの場合にのみ、タイトルとタイマーを更新する
        // ここでは、タイマーが停止していることを示す表示にする
        titleDisplay.textContent = title || '接続待機中...';
        timerDisplay.textContent = '--:--:--';
        timerDisplay.style.color = currentSettings.countdownColor; // カウントダウン色を適用
        progressContainer.style.display = 'none';
        return; // カウントダウン中の場合はプログレスバーの更新をスキップ
    } else if (isAd) {
        displayTime = -(adRemainingTime - elapsedTime);
        progressTime = currentTime + elapsedTime;
    } else {
        displayTime = currentTime + elapsedTime;
        progressTime = displayTime;
    }

    // オフセット適用
    if (displayTime >= 0 && !isAd) { // 広告再生中はオフセットを適用しない
        const offset = parseFloat(currentSettings.timerOffset) || 0;
        displayTime += offset;
        progressTime += offset; // プログレスバーにもオフセットを適用
    }

    // UI更新
    titleDisplay.style.display = currentSettings.titleVisible ? 'block' : 'none';
    titleDisplay.textContent = title || 'タイトル取得中...';
    
    const isFinalTimeNegative = displayTime < 0;
    
    // 広告再生中か、カウントダウン中かでタイマーの色を決定
    if (isAd) {
        timerDisplay.style.color = currentSettings.adTimerColor;
    } else {
        // isCountingDown のロジックは上記で処理済みのため、ここでは isFinalTimeNegative のみ考慮
        timerDisplay.style.color = isFinalTimeNegative ? currentSettings.countdownColor : currentSettings.timerColor;
    }

    timerDisplay.textContent = formatTime(displayTime, duration);

    // プログレスバー更新
    const showProgressBar = currentSettings.progressBarVisible;
    progressContainer.style.display = showProgressBar ? 'block' : 'none';
    if (showProgressBar) {
        // Amazon Prime Videoの広告再生中のみプログレスを100%に、それ以外は通常通り計算
        const isAmazonAd = isAd && videoState.source && videoState.source.includes('amazon');
        const progress = isAmazonAd
            ? 100
            : (duration > 0 && progressTime >= 0) ? Math.min((progressTime / duration) * 100, 100) : 0;
        
        progressBar.style.width = `${progress}%`;

        progressBar.style.backgroundColor = '';
        progressBar.style.background = '';
        progressBar.classList.remove('rainbow-animate');

        if (currentSettings.rainbowEffect) {
            progressBar.classList.add('rainbow-animate');
        } else if (currentSettings.gradientEnabled && progressTime >= 0) {
            // グラデーション計算にも progressTime を使用
            const progressFactor = progressTime / duration;
            const newColor = interpolateColor(currentSettings.progressBarColor, currentSettings.gradientEndColor, progressFactor);
            progressBar.style.backgroundColor = newColor;
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
