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
        isRunning: false,
        showNotification: false
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
        timeLeft = result.timeLeft || 25 * 60; // Changed back to 25 minutes
        isBreak = result.isBreak || false;
        workTime = result.workTime || 25; // Changed back to 25 minutes
        breakTime = result.breakTime || 5; // Changed back to 5 minutes
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
                saveState(); // Save state before starting timer
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
                    isRunning,
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
        saveState(); // Save state when starting
        timer = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                saveState(); // Save state on each tick
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
                isRunning = false; // Don't keep running when switching to break mode
                saveState(); // Save state after completion
                
                // Show notification
                showNotification();
                
                // Notify popup about completion with correct break state
                ports.forEach(port => {
                    port.postMessage({
                        action: 'TIMER_COMPLETED',
                        timeLeft: timeLeft,
                        isBreak: isBreak,  // Send the new break state
                        isRunning: isRunning  // Send the running state (which is now false)
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
    saveState(); // Make sure to save state when pausing
}

function resetTimer() {
    pauseTimer();
    // Use the current mode to determine which time to reset to
    timeLeft = isBreak ? breakTime * 60 : workTime * 60;
    isRunning = false;
    saveState(); // Save the reset state
    
    // Notify popup about reset
    ports.forEach(port => {
        port.postMessage({
            action: 'TIMER_RESET',
            timeLeft: timeLeft,
            isBreak: isBreak, // Keep the current break state
            isRunning: false
        });
    });
}

function switchMode() {
    isBreak = !isBreak;
    timeLeft = (isBreak ? breakTime : workTime) * 60;
    showNotification();
}

// Add this function as an alternative notification method
function showBadgeNotification() {
    // Update the extension badge
    chrome.action.setBadgeText({ text: isBreak ? 'BREAK' : 'WORK' });
    chrome.action.setBadgeBackgroundColor({ 
        color: isBreak ? '#059669' : '#2563eb' 
    });
    
    // Try to play a sound (this might not work in all browsers)
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + Array(20).join('A'));
    audio.play().catch(e => console.log('Could not play notification sound', e));
}

// Modify the timer completion code to use both notification methods
function showNotification() {
    // Update the extension badge
    chrome.action.setBadgeText({ text: isBreak ? 'BREAK' : 'WORK' });
    chrome.action.setBadgeBackgroundColor({ 
        color: isBreak ? '#059669' : '#2563eb' 
    });
    
    // Set a flag in storage to show notification in popup
    chrome.storage.local.set({
        showNotification: true,
        notificationMessage: isBreak ? 'Time for a break!' : 'Break is over, back to work!',
        notificationTimestamp: Date.now()
    });
    
    // Try to open the popup if it's not already open
    chrome.action.openPopup();
    
    // Try Chrome's notification API as well
    try {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            title: 'Pomodoro Timer',
            message: isBreak ? 'Time for a break!' : 'Break is over, back to work!'
        });
    } catch (error) {
        console.error('Error showing notification:', error);
    }
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
