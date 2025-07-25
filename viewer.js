document.addEventListener('DOMContentLoaded', () => {
    // UI要素
    const timerContainer = document.getElementById('timer-container');
    const messageContainer = document.getElementById('message-container');
    const titleDisplay = document.getElementById('title');
    const timerDisplay = document.getElementById('timer');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const container = document.body;

    let latestData = null;
    let animationFrameId = null;
    let currentSettings = {};

    // URLからパラメータを取得
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');
    const encodedConfig = urlParams.get('config');

    function showMessage(text) {
        timerContainer.style.display = 'none';
        messageContainer.style.display = 'flex';
        messageContainer.querySelector('p').textContent = text;
    }

    if (!sessionId || !encodedConfig) {
        showMessage('URLが無効です。拡張機能の設定ページから正しいURLをコピーしてください。');
        return;
    }

    try {
        // Base64デコードして設定情報を復元
        const configStr = atob(encodedConfig);
        
        // background.jsと同様のロジックで設定をパース
        let parsedConfigStr = configStr.replace(/\/\/.*$/gm, '');
        const startIndex = parsedConfigStr.indexOf('{');
        const endIndex = parsedConfigStr.lastIndexOf('}');
        if (startIndex === -1 || endIndex === -1) throw new Error("Config format error");
        parsedConfigStr = parsedConfigStr.substring(startIndex, endIndex + 1);
        parsedConfigStr = parsedConfigStr.replace(/\s/g, ' ');
        parsedConfigStr = parsedConfigStr.replace(/([{, ])([a-zA-Z0-9_]+)( *:[^/])/g, '$1"$2"$3');
        parsedConfigStr = parsedConfigStr.replace(/'/g, '"');
        parsedConfigStr = parsedConfigStr.replace(/, *}/g, ' }');
        
        const firebaseConfig = JSON.parse(parsedConfigStr);

        // Firebaseを初期化
        const app = firebase.initializeApp(firebaseConfig);
        const db = firebase.database(app);
        const dbRef = firebase.database().ref('timers/' + sessionId);

        // データ変更を監視
        dbRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                latestData = data;
                if (timerContainer.style.display === 'none') {
                    timerContainer.style.display = 'flex';
                    messageContainer.style.display = 'none';
                    if (!animationFrameId) {
                        animationLoop();
                    }
                }
            } else {
                latestData = null;
                showMessage('データがありません。拡張機能側でWeb連携が有効になっているか確認してください。');
            }
        });

    } catch (e) {
        console.error("初期化に失敗しました:", e);
        showMessage('初期化に失敗しました。URLの形式を確認してください。');
        return;
    }

    function applySettings(settings) {
        currentSettings = settings;
        container.style.backgroundColor = settings.bgColor;
        titleDisplay.style.fontFamily = settings.titleFont;
        titleDisplay.style.fontWeight = settings.titleWeight;
        titleDisplay.style.color = settings.titleColor;
        titleDisplay.style.fontSize = `${settings.titleSize}px`;
        timerDisplay.style.fontFamily = settings.timerFont;
        timerDisplay.style.fontWeight = settings.timerWeight;
        const shadow = settings.shadowVisible ? `2px 2px ${settings.shadowBlur}px ${settings.shadowColor}` : 'none';
        titleDisplay.style.textShadow = shadow;
        timerDisplay.style.textShadow = shadow;
        progressContainer.style.height = `${settings.progressBarHeight}px`;
    }

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

    function updateDisplay() {
        if (!latestData || !latestData.videoState || !latestData.designSettings) {
            return;
        }
        
        applySettings(latestData.designSettings);
        const videoState = latestData.videoState;

        const elapsedTime = videoState.isPlaying ? (Date.now() - videoState.lastUpdated) / 1000 : 0;
        let displayTime = videoState.currentTime + elapsedTime;
        const duration = videoState.duration || 0;
        
        const offset = parseFloat(currentSettings.timerOffset) || 0;
        displayTime += offset;
        let progressTime = displayTime;

        titleDisplay.style.display = currentSettings.titleVisible ? 'block' : 'none';
        titleDisplay.textContent = videoState.title || '...';
        
        timerDisplay.style.color = currentSettings.timerColor;
        timerDisplay.textContent = formatTime(displayTime, duration);
        timerDisplay.style.fontSize = `${currentSettings.timerSize}px`;

        const showProgressBar = currentSettings.progressBarVisible;
        progressContainer.style.display = showProgressBar ? 'block' : 'none';

        if (showProgressBar) {
            const progress = (duration > 0 && progressTime >= 0) ? Math.min((progressTime / duration) * 100, 100) : 0;
            progressBar.style.width = `${progress}%`;

            progressBar.style.backgroundColor = '';
            progressBar.style.background = '';
            progressBar.classList.remove('rainbow-animate');

            if (currentSettings.rainbowEffect) {
                progressBar.classList.add('rainbow-animate');
            } else if (currentSettings.gradientEnabled && progressTime >= 0) {
                const progressFactor = progressTime / duration;
                const newColor = interpolateColor(currentSettings.progressBarColor, currentSettings.gradientEndColor, progressFactor);
                progressBar.style.backgroundColor = newColor;
            } else {
                progressBar.style.backgroundColor = currentSettings.progressBarColor;
            }
            progressBar.classList.toggle('sparkle', currentSettings.gradientSparkle);
        }
    }

    function animationLoop() {
        updateDisplay();
        animationFrameId = requestAnimationFrame(animationLoop);
    }
});
