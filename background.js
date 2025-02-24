let timer = null;
let timeLeft = 25 * 60; // Changed back to 25 minutes
let isBreak = false;
let workTime = 25;  // Changed back to 25 minutes
let breakTime = 5;  // Changed back to 5 minutes
let isRunning = false;
let ports = [];

// Add this at the beginning of the file, before any other code
chrome.runtime.onInstalled.addListener(() => {
    // Clear any existing state
    chrome.storage.local.clear();
    
    // Set default values
    chrome.storage.local.set({
        timeLeft: 25 * 60,  // Changed back to 25 minutes
        isBreak: false,
        workTime: 25,      // Changed back to 25 minutes
        breakTime: 5,      // Changed back to 5 minutes
        isRunning: false
    });
});

// Modify the initializeState function
function initializeState() {
    chrome.storage.local.get(['timeLeft', 'isBreak', 'workTime', 'breakTime'], (result) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }
        
        // Set default values if not in storage
        timeLeft = result.timeLeft || workTime * 60;
        isBreak = result.isBreak || false;
        workTime = result.workTime || 25;
        breakTime = result.breakTime || 5;
        isRunning = false;
        
        // Save this clean state
        saveState();
    });
}

// Call initialize on service worker startup
initializeState();

// Handle connection from popup
chrome.runtime.onConnect.addListener((port) => {
    ports.push(port);
    port.onDisconnect.addListener(() => {
        ports = ports.filter(p => p !== port);
    });
});

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        switch (request.action) {
            case 'START_TIMER':
                timeLeft = request.timeLeft;
                isBreak = request.isBreak;
                workTime = request.workTime;
                breakTime = request.breakTime;
                isRunning = true;
                startTimer();
                sendResponse({ success: true });
                break;
            case 'PAUSE_TIMER':
                isRunning = false;
                pauseTimer();
                sendResponse({ success: true });
                break;
            case 'RESET_TIMER':
                resetTimer();
                sendResponse({ success: true });
                break;
            case 'GET_TIMER_STATE':
                sendResponse({ 
                    timeLeft, 
                    isBreak, 
                    isRunning: timer !== null,
                    workTime,
                    breakTime
                });
                break;
        }
    } catch (error) {
        console.error('Error in message handler:', error);
        sendResponse({ error: error.message });
    }
    return true; // Keep the message channel open for async response
});

// Add this function to save state
function saveState() {
    chrome.storage.local.set({
        timeLeft,
        isBreak,
        workTime,
        breakTime,
        isRunning
    });
}

function startTimer() {
    if (!timer) {
        timer = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                saveState();
                ports.forEach(port => {
                    port.postMessage({
                        action: 'TIMER_UPDATE',
                        timeLeft: timeLeft,
                        isBreak: isBreak
                    });
                });
            } else {
                // Handle timer completion
                clearInterval(timer);
                timer = null;
                isBreak = !isBreak;  // Switch between work and break
                timeLeft = isBreak ? breakTime * 60 : workTime * 60;
                isRunning = false;
                saveState();
                
                // Show notification
                showNotification();
                
                // Notify popup about completion with correct break state
                ports.forEach(port => {
                    port.postMessage({
                        action: 'TIMER_COMPLETED',
                        timeLeft: timeLeft,
                        isBreak: isBreak,  // Send the new break state
                        isRunning: false
                    });
                });
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
    timeLeft = workTime * 60;
    isBreak = false;
    isRunning = false;
    saveState(); // Save the reset state
    
    // Notify popup about reset
    ports.forEach(port => {
        port.postMessage({
            action: 'TIMER_RESET',
            timeLeft: timeLeft,
            isBreak: isBreak,
            isRunning: false
        });
    });
}

function switchMode() {
    isBreak = !isBreak;
    timeLeft = (isBreak ? breakTime : workTime) * 60;
    showNotification();
}

function showNotification() {
    chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',  // Tiny transparent PNG
        title: 'Pomodoro Timer',
        message: isBreak ? 'Time for a break!' : 'Break is over, back to work!',
        silent: false
    });
}

function broadcastUpdate() {
    if (ports.length > 0) {
        const message = { 
            action: 'UPDATE_TIME', 
            timeLeft,
            isBreak 
        };
        ports.forEach(port => port.postMessage(message));
    }
}
