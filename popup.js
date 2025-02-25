class PomodoroTimer {
    constructor() {
        // Add this line before the DOMContentLoaded listener
        this.port = chrome.runtime.connect({ name: 'popup' });
        
        // Add this property to track if break time was manually set
        this.breakTimeManuallySet = false;
        
        // Add this property to track the current category
        this.currentCategory = null;
        
        // Add these properties to track the current timer
        this.currentTimerId = null;
        this.currentTimerName = null;
        
        // Listen for timer updates from background
        this.port.onMessage.addListener((message) => {
            if (message.action === 'TIMER_UPDATE') {
                this.timeLeft = message.timeLeft;
                this.isBreak = message.isBreak;
                this.isRunning = true;
                this.updateDisplay();
            } else if (message.action === 'TIMER_COMPLETED') {
                this.timeLeft = message.timeLeft;
                this.isBreak = message.isBreak;
                this.isRunning = message.isRunning || false;
                this.updateDisplay();
            }
        });

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeTimer();
        });

        // Add this property to track undefined timer count
        this.undefinedTimerCount = 0;
    }

    async initializeTimer() {
        // Get initial state from background
        chrome.runtime.sendMessage({ action: 'GET_TIMER_STATE' }, (response) => {
            if (response) {
                this.timeLeft = response.timeLeft;
                this.isBreak = response.isBreak;
                this.isRunning = response.isRunning;
                this.workTime = response.workTime;
                this.breakTime = response.breakTime || 5; // Add default value
                
                // Update break time display
                if (this.breakTimeDisplay) {
                    this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
                }
                
                // Update button states based on running state
                if (this.startButton && this.pauseButton) {
                    this.startButton.disabled = this.isRunning;
                    this.pauseButton.disabled = !this.isRunning;
                }
                
                this.updateDisplay();
            }
        });

        // Check for notification
        chrome.storage.local.get(['showNotification', 'notificationMessage', 'notificationTimestamp'], (result) => {
            if (result.showNotification && result.notificationTimestamp) {
                // Only show notifications that are less than 10 seconds old
                const now = Date.now();
                if (now - result.notificationTimestamp < 10000) {
                    this.showCustomNotification(result.notificationMessage);
                }
                // Clear the notification flag
                chrome.storage.local.set({ showNotification: false });
            }
        });

        // Initialize rest of the timer
        this.initializeElements();
        this.loadTimers();
        this.loadCategories();
        this.addEventListeners();
    }

    calculateBreakTime(workMinutes) {
        // Only auto-calculate if the break time hasn't been manually set
        if (!this.breakTimeManuallySet) {
            // Break time is 20% of work time, rounded to nearest minute
            return Math.round(workMinutes * 0.2);
        }
        return this.breakTime;
    }

    async initializeElements() {
        // Get all required DOM elements
        this.timeDisplay = document.getElementById('time');
        this.statusDisplay = document.getElementById('status');
        this.startButton = document.getElementById('start');
        this.pauseButton = document.getElementById('pause');
        this.resetButton = document.getElementById('reset');
        this.breakTimeDisplay = document.getElementById('break-time-display');
        this.timerList = document.getElementById('timer-list');
        this.timerNameInput = document.getElementById('timer-name');
        this.presetWorkTimeInput = document.getElementById('preset-work-time');
        this.saveTimerButton = document.getElementById('save-timer');
        this.categoryModal = document.getElementById('category-modal');
        this.categoryModalBtn = document.getElementById('category-modal-btn');
        this.closeModalBtn = document.querySelector('.close-modal');
        this.categoryNameInput = document.getElementById('category-name');
        this.categoryColorInput = document.getElementById('category-color');
        this.addCategoryButton = document.getElementById('add-category');
        this.timerModal = document.getElementById('timer-modal');
        this.timerModalBtn = document.getElementById('timer-modal-btn');
        this.timerCategorySelect = document.getElementById('timer-category');
        this.categoryFilter = document.getElementById('category-filter');
        this.switchModeButton = document.getElementById('switch-mode');

        // Verify all required elements are found
        if (!this.timeDisplay || !this.statusDisplay) {
            console.error('Required DOM elements not found');
            return;
        }

        // Initialize break time display if it exists
        if (this.breakTimeDisplay) {
            this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
            
            // Add event listeners for editable break time
            this.breakTimeDisplay.addEventListener('focus', () => {
                // Store original value in case of invalid input
                this.breakTimeDisplay.dataset.original = this.breakTimeDisplay.textContent;
            });
            
            this.breakTimeDisplay.addEventListener('blur', () => {
                const breakTimeStr = this.breakTimeDisplay.textContent.trim();
                // Extract the number from "Break time: X min"
                const match = breakTimeStr.match(/Break time: (\d+) min/);
                
                if (!match) {
                    // If the format is invalid, restore the original
                    this.breakTimeDisplay.textContent = this.breakTimeDisplay.dataset.original;
                    return;
                }
                
                const minutes = parseInt(match[1]);
                
                if (isNaN(minutes) || minutes < 1) {
                    // Restore original value if input is invalid
                    this.breakTimeDisplay.textContent = this.breakTimeDisplay.dataset.original;
                    return;
                }
                
                this.breakTime = minutes;
                this.breakTimeManuallySet = true;
                this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
                
                // If we're in break mode and not running, update the timer
                if (this.isBreak && !this.isRunning) {
                    this.timeLeft = this.breakTime * 60;
                    this.updateDisplay();
                }
            });
            
            this.breakTimeDisplay.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.breakTimeDisplay.blur();
                }
            });
        }

        // Initialize modal display
        if (this.categoryModal) this.categoryModal.style.display = 'none';
        if (this.timerModal) this.timerModal.style.display = 'none';

        // Add event listeners for editable time
        this.timeDisplay.addEventListener('focus', () => {
            // Store original value in case of invalid input
            this.timeDisplay.dataset.original = this.timeDisplay.textContent;
        });

        this.timeDisplay.addEventListener('blur', () => {
            const timeStr = this.timeDisplay.textContent.trim();
            const minutes = parseInt(timeStr);
            
            if (isNaN(minutes) || minutes < 25) {
                // Restore original value if input is invalid
                this.timeDisplay.textContent = this.timeDisplay.dataset.original;
                return;
            }

            this.workTime = minutes;
            
            // Only auto-calculate break time if it hasn't been manually set
            if (!this.breakTimeManuallySet) {
                this.breakTime = this.calculateBreakTime(this.workTime);
                if (this.breakTimeDisplay) {
                    this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
                }
            }
            
            if (!this.isRunning) {
                this.timeLeft = this.workTime * 60;
                this.updateDisplay();
            }
        });

        this.timeDisplay.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.timeDisplay.blur();
            }
        });

        // Update initial button text based on state
        this.updateStartButtonText();
    }

    addEventListeners() {
        this.startButton.addEventListener('click', () => this.start());
        this.pauseButton.addEventListener('click', () => this.pause());
        this.resetButton.addEventListener('click', () => this.reset());
        this.addCategoryButton.addEventListener('click', () => this.addNewCategory());
        this.saveTimerButton.addEventListener('click', () => this.saveTimer());
        
        // Close modal buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.categoryModal.style.display = 'none';
                this.timerModal.style.display = 'none';
            });
        });

        // Modal background click to close
        window.addEventListener('click', (e) => {
            if (e.target === this.categoryModal) {
                this.categoryModal.style.display = 'none';
            }
            if (e.target === this.timerModal) {
                this.timerModal.style.display = 'none';
            }
        });

        // Modal open buttons
        this.categoryModalBtn.addEventListener('click', () => {
            this.categoryModal.style.display = 'flex';
        });

        this.timerModalBtn.addEventListener('click', () => {
            this.loadCategories();
            this.timerModal.style.display = 'flex';
        });

        this.categoryFilter.addEventListener('change', () => this.loadTimers());
        this.switchModeButton.addEventListener('click', () => this.handleModeSwitch());
    }

    async addNewCategory() {
        const categoryName = this.categoryNameInput.value.trim();
        const categoryColor = this.categoryColorInput.value;

        if (!categoryName) {
            alert('Please enter a category name');
            return;
        }

        const { error } = await supabase
            .from('categories')
            .insert([{ 
                name: categoryName,
                color: categoryColor
            }]);

        if (error) {
            console.error('Error adding category:', error);
            return;
        }

        // Clear inputs
        this.categoryNameInput.value = '';
        this.categoryColorInput.value = '#ffffff';
        
        // Close the modal
        this.categoryModal.style.display = 'none';
        
        // Refresh all relevant components
        await Promise.all([
            this.loadCategories(),  // Refresh category dropdowns
            this.loadTimers()       // Refresh timer list with categories
        ]);
        
        // Update category filters
        if (this.timerCategorySelect) {
            this.timerCategorySelect.value = '';
        }
        if (this.categoryFilter) {
            this.categoryFilter.value = '';
        }
    }

    async syncWithBackground() {
        chrome.runtime.sendMessage({ action: 'GET_TIMER_STATE' }, (response) => {
            this.timeLeft = response.timeLeft;
            this.isBreak = response.isBreak;
            this.isRunning = response.isRunning;
            this.workTime = response.workTime;
            this.breakTime = response.breakTime;
            this.updateDisplay();
        });
    }

    start() {
        if (!this.isRunning) {
            chrome.runtime.sendMessage({
                action: 'START_TIMER',
                timeLeft: this.timeLeft,
                isBreak: this.isBreak,
                workTime: this.workTime,
                breakTime: this.breakTime
            }, (response) => {
                if (response && response.success) {
                    this.isRunning = true;
                    this.updateDisplay();
                }
            });
        }
    }

    pause() {
        chrome.runtime.sendMessage({ action: 'PAUSE_TIMER' }, (response) => {
            if (response && response.success) {
                this.isRunning = false;
                this.updateDisplay();
            }
        });
    }

    reset() {
        chrome.runtime.sendMessage({ action: 'RESET_TIMER' }, (response) => {
            if (response && response.success) {
                this.isRunning = false;
                this.timeLeft = this.isBreak ? this.breakTime * 60 : this.workTime * 60;
                this.updateDisplay();
                this.startButton.disabled = false;
                this.pauseButton.disabled = true;
                // Update button text back to Start
                this.updateStartButtonText();
            }
        });
    }

    updateTimer() {
        if (this.timeLeft > 0) {
            this.timeLeft--;
            this.updateDisplay();
        } else {
            this.switchMode();
        }
    }

    async switchMode() {
        // Save the session if we're currently in work mode (about to switch to break)
        if (!this.isBreak) {
            await this.saveSession();
        }
        
        // Switch modes
        this.isBreak = !this.isBreak;
        this.timeLeft = (this.isBreak ? this.breakTime : this.workTime) * 60;

        this.updateDisplay();
        this.showNotification();
    }

    async saveSession() {
        // Create session data with more details
        const sessionData = {
            category_id: this.currentCategory || null,
            timer_id: this.currentTimerId || null,
            timer_name: this.currentTimerName || 'Manual Timer',
            duration: this.workTime,
            break_duration: this.breakTime,
            completed_at: new Date()
        };
        
        console.log('Saving session:', sessionData);
        
        const { error } = await supabase
            .from('sessions')
            .insert([sessionData]);

        if (error) {
            console.error('Error saving session:', error);
        } else {
            console.log('Session saved successfully');
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timeDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.statusDisplay.textContent = this.isBreak ? 'Break Time' : 'Work Time';
        
        // Correctly set button states
        if (this.startButton && this.pauseButton) {
            // Start button should be disabled when running
            this.startButton.disabled = this.isRunning;
            
            // Pause button should be disabled when not running
            this.pauseButton.disabled = !this.isRunning;
        }
        
        // Update the start button text
        this.updateStartButtonText();

        // Update progress ring
        const circle = document.querySelector('.progress-ring__circle');
        if (circle) {
            const totalTime = (this.isBreak ? this.breakTime : this.workTime) * 60;
            const progress = (this.timeLeft / totalTime);
            const circumference = 2 * Math.PI * 90;
            const offset = circumference * (1 - progress);
            circle.style.strokeDashoffset = offset;
        }
    }

    showNotification() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            title: 'Pomodoro Timer ⏰',
            message: this.isBreak ? '🌿 Time for a break!' : '💼 Break is over, back to work!',
            silent: false
        });
    }

    async saveTimer() {
        let name = this.timerNameInput.value.trim();
        const workTime = parseInt(this.presetWorkTimeInput.value);
        const categoryId = this.timerCategorySelect.value;
        
        // If no name provided, generate "Undefined X" where X is incremental
        if (!name) {
            this.undefinedTimerCount++;
            name = `Undefined ${this.undefinedTimerCount}`;
        }

        if (!workTime) {
            alert('Please enter work time');
            return;
        }

        // Calculate break time based on work time if not manually set
        const breakTime = this.breakTimeManuallySet ? this.breakTime : this.calculateBreakTime(workTime);

        const { error } = await supabase
            .from('timers')
            .insert([{ 
                name,
                work_time: workTime,
                break_time: breakTime, // Add break time to the database
                category_id: categoryId || null
            }]);

        if (error) {
            console.error('Error saving timer:', error);
            return;
        }

        // Clear form
        this.timerNameInput.value = '';
        this.presetWorkTimeInput.value = '25';
        this.timerCategorySelect.value = '';
        
        // Close modal
        this.timerModal.style.display = 'none';
        
        // Refresh timer list
        await this.loadTimers();
    }

    async loadTimers() {
        // Add this at the beginning of loadTimers to get the current count
        const { data: timers } = await supabase
            .from('timers')
            .select('name')
            .ilike('name', 'Undefined%');
        
        this.undefinedTimerCount = timers ? timers.length : 0;
        
        this.timerList.innerHTML = '';
        
        const { data: timersData, error } = await supabase
            .from('timers')
            .select(`
                *,
                categories:category_id (
                    name,
                    color
                )
            `);

        if (error) {
            console.error('Error loading timers:', error);
            return;
        }

        // Filter timers by selected category
        const selectedCategory = this.categoryFilter.value;
        const filteredTimers = selectedCategory 
            ? timersData.filter(timer => timer.category_id === selectedCategory)
            : timersData;

        // Group filtered timers by category
        const timersByCategory = filteredTimers.reduce((acc, timer) => {
            const categoryName = timer.categories?.name || 'Uncategorized';
            if (!acc[categoryName]) {
                acc[categoryName] = [];
            }
            acc[categoryName].push(timer);
            return acc;
        }, {});

        // Create elements for each category and its timers
        Object.entries(timersByCategory).forEach(([categoryName, categoryTimers]) => {
            const categoryElement = document.createElement('div');
            categoryElement.className = 'timer-category';
            categoryElement.innerHTML = `<h4>${categoryName}</h4>`;
            
            const timersContainer = document.createElement('div');
            timersContainer.className = 'category-timers';
            
            categoryTimers.forEach(timer => {
                const timerElement = document.createElement('div');
                timerElement.className = 'timer-preset-item';
                
                // Add break time to the display if available
                const breakTimeDisplay = timer.break_time ? 
                    `<span class="timer-break-duration">(Break: ${timer.break_time} min)</span>` : '';
                    
                timerElement.innerHTML = `
                    <div class="timer-info">
                        <span class="timer-name" contenteditable="true">${timer.name}</span>
                        <span class="timer-duration">${timer.work_time} min ${breakTimeDisplay}</span>
                    </div>
                    <button class="delete-timer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                `;
                
                // Add event listener for name editing
                const nameElement = timerElement.querySelector('.timer-name');
                nameElement.addEventListener('blur', async () => {
                    const newName = nameElement.textContent.trim();
                    if (newName !== timer.name) {
                        const { error } = await supabase
                            .from('timers')
                            .update({ name: newName })
                            .eq('id', timer.id);

                        if (error) {
                            console.error('Error updating timer name:', error);
                            nameElement.textContent = timer.name; // Revert on error
                            return;
                        }
                        
                        timer.name = newName;
                    }
                });

                // Prevent Enter key from creating new lines
                nameElement.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        nameElement.blur();
                    }
                });
                
                timerElement.addEventListener('click', () => {
                    this.workTime = timer.work_time;
                    // Set break time from the database if available
                    if (timer.break_time) {
                        this.breakTime = timer.break_time;
                        this.breakTimeManuallySet = true;
                        if (this.breakTimeDisplay) {
                            this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
                        }
                    } else {
                        // Calculate break time if not available
                        this.breakTime = this.calculateBreakTime(this.workTime);
                        this.breakTimeManuallySet = false;
                        if (this.breakTimeDisplay) {
                            this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
                        }
                    }
                    
                    this.timeLeft = this.workTime * 60;
                    this.updateDisplay();
                    
                    // Set the current timer information for session tracking
                    this.currentCategory = timer.category_id;
                    this.currentTimerId = timer.id;
                    this.currentTimerName = timer.name;

                    document.querySelectorAll('.timer-preset-item').forEach(el => 
                        el.classList.remove('active'));
                    timerElement.classList.add('active');
                });
                
                timerElement.querySelector('.delete-timer').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this timer?')) {
                        const { error } = await supabase
                            .from('timers')
                            .delete()
                            .eq('id', timer.id);

                        if (error) {
                            console.error('Error deleting timer:', error);
                            return;
                        }
                        this.loadTimers();
                    }
                });
                
                timersContainer.appendChild(timerElement);
            });
            
            categoryElement.appendChild(timersContainer);
            this.timerList.appendChild(categoryElement);
        });
    }

    async loadCategories() {
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*');

        if (error) {
            console.error('Error loading categories:', error);
            return;
        }

        // Update both category selects
        const selects = [this.timerCategorySelect, this.categoryFilter];
        selects.forEach(select => {
            // Clear existing options
            select.innerHTML = select === this.timerCategorySelect 
                ? '<option value="">Select a category</option>'
                : '<option value="">All Categories</option>';
            
            // Add category options
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
        });
    }

    showCustomNotification(message) {
        const notification = document.getElementById('custom-notification');
        const messageElement = document.getElementById('notification-message');
        
        if (notification && messageElement) {
            messageElement.textContent = message;
            notification.style.display = 'block';
            notification.classList.add('shake');
            
            // Hide after 5 seconds
            setTimeout(() => {
                notification.style.display = 'none';
                notification.classList.remove('shake');
            }, 5000);
        }
    }

    async handleModeSwitch() {
        // If timer is running, ask for confirmation
        if (this.isRunning) {
            if (!confirm('Timer is running. Are you sure you want to switch modes?')) {
                return;
            }
            // Pause the timer
            await this.pause();
        }

        // If switching from work to break, save the session
        if (!this.isBreak) {
            await this.saveSession();
        }

        // Switch the mode
        this.isBreak = !this.isBreak;
        this.timeLeft = (this.isBreak ? this.breakTime : this.workTime) * 60;
        
        // Update the display
        this.updateDisplay();
        
        // Enable the start button
        this.startButton.disabled = false;
        this.pauseButton.disabled = true;
    }

    // Add this new method to handle button text updates
    updateStartButtonText() {
        if (this.isRunning) {
            this.startButton.textContent = 'Start';  // Keep it as 'Start' when running
            return;
        }
        
        // Only show 'Resume' when paused (not at full duration)
        const fullDuration = (this.isBreak ? this.breakTime : this.workTime) * 60;
        this.startButton.textContent = this.timeLeft < fullDuration ? 'Resume' : 'Start';
    }
}

// Add listener for timer updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'UPDATE_TIME') {
        const timer = document.querySelector('.pomodoro-timer');
        if (timer) {
            timer.timeLeft = request.timeLeft;
            timer.isBreak = request.isBreak;
            timer.updateDisplay();
        }
    }
});

// Create instance when document is loaded
const timer = new PomodoroTimer();
