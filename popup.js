class PomodoroTimer {
    constructor() {
        this.workTime = 25;
        this.breakTime = this.calculateBreakTime(this.workTime);
        this.isRunning = false;
        this.isBreak = false;
        this.timeLeft = this.workTime * 60;
        this.currentCategory = null;
        
        this.timerList = document.getElementById('timer-list');
        this.timerNameInput = document.getElementById('timer-name');
        this.presetWorkTimeInput = document.getElementById('preset-work-time');
        this.saveTimerButton = document.getElementById('save-timer');
        
        // Add modal elements
        this.categoryModal = document.getElementById('category-modal');
        this.categoryModalBtn = document.getElementById('category-modal-btn');
        this.closeModalBtn = document.querySelector('.close-modal');
        this.categoryNameInput = document.getElementById('category-name');
        this.categoryColorInput = document.getElementById('category-color');
        this.addCategoryButton = document.getElementById('add-category');
        
        this.timerModal = document.getElementById('timer-modal');
        this.timerModalBtn = document.getElementById('timer-modal-btn');
        this.timerCategorySelect = document.getElementById('timer-category');
        
        // Make sure modal is hidden initially
        this.categoryModal.style.display = 'none';
        this.timerModal.style.display = 'none';
        
        this.categoryFilter = document.getElementById('category-filter');
        
        this.initializeElements();
        this.loadTimers();
        this.loadCategories();
        this.addEventListeners();
    }

    calculateBreakTime(workMinutes) {
        // Break time is 20% of work time, rounded to nearest minute
        return Math.round(workMinutes * 0.2);
    }

    async initializeElements() {
        this.timeDisplay = document.getElementById('time');
        this.statusDisplay = document.getElementById('status');
        this.startButton = document.getElementById('start');
        this.pauseButton = document.getElementById('pause');
        this.resetButton = document.getElementById('reset');
        this.breakTimeDisplay = document.getElementById('break-time-display');

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
            this.breakTime = this.calculateBreakTime(this.workTime);
            this.breakTimeDisplay.textContent = `Break time: ${this.breakTime} min`;
            
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

        this.categoryNameInput.value = '';
        this.categoryColorInput.value = '#ffffff';
        this.loadTimers();
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.timer = setInterval(() => this.updateTimer(), 1000);
        }
    }

    pause() {
        this.isRunning = false;
        clearInterval(this.timer);
    }

    reset() {
        this.isRunning = false;
        clearInterval(this.timer);
        this.timeLeft = this.workTime * 60;
        this.isBreak = false;
        this.updateDisplay();
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
        this.isBreak = !this.isBreak;
        this.timeLeft = (this.isBreak ? this.breakTime : this.workTime) * 60;
        
        if (!this.isBreak) {
            await this.saveSession();
        }

        this.updateDisplay();
        this.showNotification();
    }

    async saveSession() {
        if (!this.currentCategory) return;

        const { error } = await supabase
            .from('sessions')
            .insert([{
                category_id: this.currentCategory,
                duration: this.workTime,
                completed_at: new Date()
            }]);

        if (error) {
            console.error('Error saving session:', error);
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timeDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.statusDisplay.textContent = this.isBreak ? 'Break Time' : 'Work Time';

        // Update progress ring
        const circle = document.querySelector('.progress-ring__circle');
        const totalTime = (this.isBreak ? this.breakTime : this.workTime) * 60;
        const progress = (this.timeLeft / totalTime);
        const circumference = 2 * Math.PI * 90;
        const offset = circumference * (1 - progress);
        circle.style.strokeDashoffset = offset;
    }

    showNotification() {
        chrome.notifications.create({
            type: 'basic',
            title: 'Pomodoro Timer',
            message: this.isBreak ? 'Time for a break!' : 'Break is over, back to work!',
            iconUrl: 'icon.png'
        });
    }

    async saveTimer() {
        const name = this.timerNameInput.value.trim();
        const workTime = parseInt(this.presetWorkTimeInput.value);
        const categoryId = this.timerCategorySelect.value;
        
        if (!name || !workTime) {
            alert('Please enter a timer name and work time');
            return;
        }

        const { error } = await supabase
            .from('timers')
            .insert([{ 
                name,
                work_time: workTime,
                category_id: categoryId || null
            }]);

        if (error) {
            console.error('Error saving timer:', error);
            return;
        }

        this.timerNameInput.value = '';
        this.presetWorkTimeInput.value = '25';
        this.timerCategorySelect.value = '';
        this.timerModal.style.display = 'none';
        this.loadTimers();
    }

    async loadTimers() {
        this.timerList.innerHTML = '';
        
        const { data: timers, error } = await supabase
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
            ? timers.filter(timer => timer.category_id === selectedCategory)
            : timers;

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
                timerElement.innerHTML = `
                    <div class="timer-info">
                        <span class="timer-name">${timer.name}</span>
                        <span class="timer-duration">${timer.work_time} min</span>
                    </div>
                    <button class="delete-timer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                `;
                
                timerElement.addEventListener('click', () => {
                    this.workTime = timer.work_time;
                    this.timeLeft = this.workTime * 60;
                    this.updateDisplay();

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
}

document.addEventListener('DOMContentLoaded', () => {
    new PomodoroTimer();
});
