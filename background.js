let timer = null;
let timeLeft = 0;
let isBreak = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'START_TIMER':
            timeLeft = request.timeLeft;
            isBreak = request.isBreak;
            startTimer();
            break;
        case 'PAUSE_TIMER':
            pauseTimer();
            break;
        case 'RESET_TIMER':
            resetTimer();
            break;
        case 'GET_TIMER_STATE':
            sendResponse({ timeLeft, isBreak, isRunning: timer !== null });
            break;
    }
});

function startTimer() {
    if (!timer) {
        timer = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                chrome.runtime.sendMessage({ action: 'UPDATE_TIME', timeLeft });
            } else {
                showNotification();
                resetTimer();
            }
        }, 1000);
    }
}

function pauseTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

function resetTimer() {
    pauseTimer();
    timeLeft = 0;
    isBreak = false;
}

function showNotification() {
    chrome.notifications.create({
        type: 'basic',
        title: 'Pomodoro Timer',
        message: isBreak ? 'Break time is over!' : 'Time for a break!',
        iconUrl: 'icon.png'
    });
}
