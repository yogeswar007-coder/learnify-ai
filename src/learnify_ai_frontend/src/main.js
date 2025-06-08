import { AuthClient } from '@dfinity/auth-client';
import { createActor } from '../../declarations/learnify_ai_backend';

// Global variables
let currentTopic = '';
let currentQuiz = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let isSubmitting = false;
let hasSubmittedAnswer = false;

// Auth variables
let authClient;
let identity;
let principal;
let backendActor;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Initialize auth client
    authClient = await AuthClient.create({
        idleOptions: {
            disableIdle: true,
            disableDefaultIdleCallback: true
        }
    });

    // Check if already authenticated
    if (await authClient.isAuthenticated()) {
        identity = authClient.getIdentity();
        principal = identity.getPrincipal();
        await initializeBackend();
        setupAuthenticatedUI();
    } else {
        setupUnauthenticatedUI();
    }

    // Add event listeners
    setupEventListeners();
    
    // Show topics by default
    showSection('topicsSection');
}

async function initializeBackend() {
    backendActor = createActor(process.env.CANISTER_ID_LEARNIFY_AI_BACKEND, {
        agentOptions: {
            identity,
            host: process.env.DFX_NETWORK === 'local' ? 'http://localhost:4943' : 'https://ic0.app'
        }
    });
    console.log('Backend actor initialized');
}

function setupEventListeners() {
    // Topic cards
    const topicCards = document.querySelectorAll('.topic-card');
    topicCards.forEach(card => {
        card.addEventListener('click', handleTopicSelection);
    });

    // Navigation buttons
    document.getElementById('dashboardBtn').addEventListener('click', () => {
        if (principal) {
            showSection('dashboardSection');
            loadDashboard();
        } else {
            handleLogin();
        }
    });
    document.getElementById('quizBtn').addEventListener('click', () => showSection('topicsSection'));
    document.getElementById('badgesBtn').addEventListener('click', () => {
        if (principal) {
            showSection('badgesSection');
            loadBadges();
        } else {
            handleLogin();
        }
    });
    document.getElementById('viewAllBadgesBtn').addEventListener('click', () => {
    showSection('badgesSection');
    loadBadges();
    });

    document.getElementById('reportBtn').addEventListener('click', () => showSection('reportSection'));

    // Auth buttons
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Back to topics button
    document.getElementById('backToTopics').addEventListener('click', showTopics);
}

async function handleLogin() {
    try {
        const identityProvider = process.env.DFX_NETWORK === 'local' 
            ? `http://localhost:4943/?canisterId=${process.env.CANISTER_ID_INTERNET_IDENTITY}`
            : 'https://identity.ic0.app';
            
        await authClient.login({
            identityProvider,
            onSuccess: async () => {
                identity = authClient.getIdentity();
                principal = identity.getPrincipal();
                
                try {
                    await initializeBackend();
                    setupAuthenticatedUI();
                    showSection('topicsSection');
                } catch (backendError) {
                    console.error('Backend initialization failed:', backendError);
                    setupAuthenticatedUI();
                    showSection('topicsSection');
                }
            },
            onError: (error) => {
                console.error('Login failed:', error);
            }
        });
    } catch (error) {
        console.error('Login error:', error);
    }
}

async function handleLogout() {
    await authClient.logout();
    identity = null;
    principal = null;
    backendActor = null;
    setupUnauthenticatedUI();
    showSection('topicsSection');
}

function setupAuthenticatedUI() {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('userPrincipal').textContent = principal.toText().substring(0, 10) + '...';
    document.getElementById('userPrincipal').style.display = 'block';
}

function setupUnauthenticatedUI() {
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('userPrincipal').style.display = 'none';
}

function showSection(sectionId) {
    // Hide all sections
    const sections = ['dashboardSection', 'topicsSection', 'badgesSection', 'reportSection', 'quizSection', 'resultsSection'];
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });

    // Show selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }

    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (sectionId === 'dashboardSection') document.getElementById('dashboardBtn').classList.add('active');
    if (sectionId === 'topicsSection') document.getElementById('quizBtn').classList.add('active');
    if (sectionId === 'badgesSection') document.getElementById('badgesBtn').classList.add('active');
    if (sectionId === 'reportSection') document.getElementById('reportBtn').classList.add('active');
}

// Dashboard functionality
async function loadDashboard() {
    if (!principal || !backendActor) {
        showLoginPrompt();
        return;
    }

    try {
        console.log('Loading dashboard for principal:', principal.toText());
        
        const profile = await backendActor.getMyProfile();
        const badges = await backendActor.getMyBadges();
        
        console.log('Profile loaded:', profile);
        console.log('Badges loaded:', badges);
        updateDashboardUI(profile, badges);
        
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showDashboardError('Failed to load dashboard data');
    }
}

// Badge functionality
async function loadBadges() {
    if (!principal || !backendActor) {
        showLoginPrompt();
        return;
    }

    try {
        const allBadges = await backendActor.getAvailableBadges();
        const myBadges = await backendActor.getMyBadges();
        
        updateBadgesUI(allBadges, myBadges);
        
    } catch (error) {
        console.error('Failed to load badges:', error);
        showBadgesError('Failed to load badges data');
    }
}

function updateBadgesUI(allBadges, myBadges) {
    const container = document.getElementById('badgesContainer');
    
    if (allBadges.length === 0) {
        container.innerHTML = '<p class="no-data">No badges available yet!</p>';
        return;
    }

    container.innerHTML = allBadges.map(([id, name, description, icon, rarity]) => {
        const isEarned = myBadges.some(badge => badge.id === id);
        const earnedBadge = myBadges.find(badge => badge.id === id);
        
        return `
            <div class="badge-card ${rarity} ${isEarned ? 'earned' : 'locked'}">
                <div class="badge-icon">${icon}</div>
                <div class="badge-info">
                    <h4>${name}</h4>
                    <p>${description}</p>
                    <div class="badge-rarity ${rarity}">${rarity.toUpperCase()}</div>
                    ${isEarned ? 
                        `<div class="badge-earned">✅ Earned ${new Date(Number(earnedBadge.earnedAt)/1000000).toLocaleDateString()}</div>` :
                        `<div class="badge-locked">🔒 Not earned yet</div>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

function showBadgesError(message) {
    document.getElementById('badgesContainer').innerHTML = `
        <div class="error-message">
            <div class="error-icon">⚠️</div>
            <h3>Unable to Load Badges</h3>
            <p>${message}</p>
            <button onclick="loadBadges()" class="retry-btn">Try Again</button>
        </div>
    `;
}

function showLoginPrompt() {
    const currentSection = document.querySelector('section[style*="block"]');
    if (currentSection) {
        currentSection.innerHTML = `
            <div class="container">
                <div class="login-prompt">
                    <h2>🔐 Login Required</h2>
                    <p>Please log in with Internet Identity to view your progress and earn badges.</p>
                    <button id="dashboardLoginBtn" class="auth-btn">Login with Internet Identity</button>
                </div>
            </div>
        `;
        
        document.getElementById('dashboardLoginBtn').addEventListener('click', handleLogin);
    }
}

function updateDashboardUI(profile, badges) {
    // Restore dashboard HTML if it was replaced by login prompt
    if (!document.getElementById('totalQuizzes')) {
        restoreDashboardHTML();
    }

    // Update stats
    document.getElementById('totalQuizzes').textContent = profile.totalQuizzes;
    document.getElementById('correctAnswers').textContent = profile.correctAnswers;
    
    // Calculate accuracy
    const accuracy = profile.totalQuizzes > 0 ? 
        Math.round((profile.correctAnswers / (profile.totalQuizzes * 5)) * 100) : 0;
    document.getElementById('accuracy').textContent = accuracy + '%';
    document.getElementById('currentStreak').textContent = profile.streak;
    document.getElementById('userLevel').textContent = profile.level;
    document.getElementById('totalPoints').textContent = profile.totalPoints;

    // Update topic scores
    updateTopicScores(profile.topicScores);

    // Update badges in dashboard
    updateDashboardBadges(badges);
}

function restoreDashboardHTML() {
    document.getElementById('dashboardSection').innerHTML = `
        <div class="container">
            <h2>Your Learning Dashboard</h2>
            <div class="dashboard-grid">
                <!-- Stats Column -->
                <div class="stats-column">
                    <div class="stat-card">
                        <h3>📊 Overall Progress</h3>
                        <div class="stat-content">
                            <p>Total Quizzes: <span id="totalQuizzes">0</span></p>
                            <p>Correct Answers: <span id="correctAnswers">0</span></p>
                            <p>Accuracy: <span id="accuracy">0%</span></p>
                            <p>Current Streak: <span id="currentStreak">0</span> 🔥</p>
                            <p>Level: <span id="userLevel">1</span></p>
                            <p>Total Points: <span id="totalPoints">0</span></p>
                        </div>
                    </div>

                    <div class="stat-card">
                        <h3>🎯 Topic Performance</h3>
                        <div id="topicScores">
                            <p class="no-data">Complete quizzes to see topic stats!</p>
                        </div>
                    </div>
                </div>

                <!-- Badges Column -->
                <div class="badges-column">
                    <div class="stat-card">
                        <h3>🏅 Recent Badges</h3>
                        <div id="dashboardBadges" class="dashboard-badges">
                            <p class="no-data">Complete quizzes to earn badges!</p>
                        </div>
                        <button onclick="showSection('badgesSection'); loadBadges();" class="view-all-badges">View All Badges</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateDashboardBadges(badges) {
    const container = document.getElementById('dashboardBadges');
    
    if (badges.length === 0) {
        container.innerHTML = '<p class="no-data">Complete quizzes to earn badges!</p>';
        return;
    }

    // Show only the 3 most recent badges
    const recentBadges = badges.slice(-3).reverse();
    
    container.innerHTML = recentBadges.map(badge => `
        <div class="mini-badge-card ${badge.rarity}">
            <div class="mini-badge-icon">${badge.imageUrl}</div>
            <div class="mini-badge-info">
                <h5>${badge.name}</h5>
                <small>${badge.rarity}</small>
            </div>
        </div>
    `).join('');
}

function updateTopicScores(topicScores) {
    const container = document.getElementById('topicScores');
    
    if (topicScores.length === 0) {
        container.innerHTML = '<p class="no-data">Complete quizzes to see topic stats!</p>';
        return;
    }

    container.innerHTML = topicScores.map(([topic, score]) => `
        <div class="topic-score-item">
            <span class="topic-name">${topic}</span>
            <span class="topic-score">${score}%</span>
        </div>
    `).join('');
}

function showDashboardError(message) {
    document.getElementById('dashboardSection').innerHTML = `
        <div class="container">
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <h3>Unable to Load Dashboard</h3>
                <p>${message}</p>
                <button onclick="loadDashboard()" class="retry-btn">Try Again</button>
            </div>
        </div>
    `;
}

// Badge notification system
function showBadgeNotification(badge) {
    const notification = document.createElement('div');
    notification.className = 'badge-notification';
    notification.innerHTML = `
        <div class="badge-popup">
            <h3>🎉 New Badge Unlocked!</h3>
            <div class="badge-card ${badge.rarity}">
                <div class="badge-icon">${badge.imageUrl}</div>
                <div class="badge-info">
                    <h4>${badge.name}</h4>
                    <p>${badge.description}</p>
                    <div class="badge-rarity ${badge.rarity}">${badge.rarity.toUpperCase()}</div>
                </div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="close-notification">Close</button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 8000);
}

async function checkForNewBadges(previousBadgeCount) {
    try {
        const currentBadges = await backendActor.getMyBadges();
        if (currentBadges.length > previousBadgeCount) {
            // Show notification for the newest badge
            const newestBadge = currentBadges[currentBadges.length - 1];
            showBadgeNotification(newestBadge);
        }
    } catch (error) {
        console.error('Error checking for new badges:', error);
    }
}

function handleTopicSelection(event) {
    const card = event.currentTarget;
    currentTopic = card.dataset.topic;
    console.log('Selected topic:', currentTopic);
    
    if (!principal) {
        alert('Please log in with Internet Identity to take quizzes');
        handleLogin();
        return;
    }
    
    generateQuiz(currentTopic);
}

async function generateQuiz(topic) {
    showQuizSection();
    showLoading();
    
    // Reset all quiz state
    currentQuestionIndex = 0;
    userAnswers = [];
    isSubmitting = false;
    hasSubmittedAnswer = false;

    try {
        console.log('Generating quiz for topic:', topic);
        
        const response = await fetch('http://localhost:4000/api/generate-quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                topic: topic,
                numQuestions: 5
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Quiz data received:', data);
        
        if (data.success && data.questions && data.questions.length > 0) {
            currentQuiz = data.questions;
            displayQuestion();
        } else {
            showError('Failed to generate quiz. Please try again.');
        }
    } catch (error) {
        console.error('Error generating quiz:', error);
        if (error.message.includes('Failed to fetch')) {
            showError('Cannot connect to quiz server. Please make sure the bridge server is running on port 4000.');
        } else {
            showError('Network error. Please check your connection and try again.');
        }
    }
}

function displayQuestion() {
    const question = currentQuiz[currentQuestionIndex];
    const questionCounter = document.getElementById('questionCounter');
    const quizContent = document.getElementById('quizContent');

    questionCounter.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuiz.length}`;

    // Reset submission states
    isSubmitting = false;
    hasSubmittedAnswer = false;

    quizContent.innerHTML = `
        <div class="quiz-question">
            <h3>${question.question}</h3>
            <div class="options">
                ${question.options.map((option, index) => `
                    <div class="option" data-option="${index}">
                        ${option}
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="quiz-actions">
            <button id="submitAnswer" disabled>Submit Answer</button>
        </div>
    `;

    // Add option selection handlers
    const options = document.querySelectorAll('.option');
    const submitBtn = document.getElementById('submitAnswer');
    
    options.forEach(option => {
        option.addEventListener('click', function() {
            if (hasSubmittedAnswer) return;
            
            // Remove previous selection
            options.forEach(opt => opt.classList.remove('selected'));
            // Add selection to clicked option
            this.classList.add('selected');
            // Enable submit button
            submitBtn.disabled = false;
        });
    });

    submitBtn.addEventListener('click', submitAnswer);
}

async function submitAnswer() {
    if (isSubmitting || hasSubmittedAnswer) {
        console.log('Submission already in progress or completed');
        return;
    }
    
    const selectedOption = document.querySelector('.option.selected');
    if (!selectedOption) return;

    // Set submission flags immediately
    isSubmitting = true;
    hasSubmittedAnswer = true;
    
    const submitBtn = document.getElementById('submitAnswer');
    const options = document.querySelectorAll('.option');
    
    // Disable everything immediately
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    options.forEach(option => {
        option.style.pointerEvents = 'none';
    });

    const userAnswer = parseInt(selectedOption.dataset.option);
    const question = currentQuiz[currentQuestionIndex];
    
    // Store user answer
    userAnswers.push(userAnswer);

    // Show visual feedback immediately
    options.forEach((option, index) => {
        if (index === question.correctAnswer) {
            option.classList.add('correct');
        } else if (index === userAnswer && userAnswer !== question.correctAnswer) {
            option.classList.add('incorrect');
        }
    });

    // Get AI feedback
    try {
        const response = await fetch('http://localhost:4000/api/grade-answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                topic: currentTopic,
                question: question.question,
                userAnswer: userAnswer,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation || 'No explanation provided.'
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showExplanation(data.feedback, data.isCorrect);
        } else {
            showExplanation(question.explanation || 'No explanation available.', userAnswer === question.correctAnswer);
        }
    } catch (error) {
        console.error('Error grading answer:', error);
        showExplanation(question.explanation || 'No explanation available.', userAnswer === question.correctAnswer);
    }

    // Reset submission flag but keep hasSubmittedAnswer true
    isSubmitting = false;

    // Update submit button for next action
    submitBtn.disabled = false;
    if (currentQuestionIndex < currentQuiz.length - 1) {
        submitBtn.textContent = 'Next Question';
        submitBtn.onclick = nextQuestion;
    } else {
        submitBtn.textContent = 'Finish Quiz';
        submitBtn.onclick = finishQuiz;
    }
}

function showExplanation(feedback, isCorrect) {
    const quizContent = document.getElementById('quizContent');
    
    // Remove any existing explanation to prevent duplicates
    const existingExplanations = quizContent.querySelectorAll('.explanation');
    existingExplanations.forEach(exp => exp.remove());
    
    const explanation = document.createElement('div');
    explanation.className = 'explanation';
    explanation.innerHTML = `
        <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</strong><br>
        ${feedback}
    `;
    quizContent.appendChild(explanation);
}

function nextQuestion() {
    currentQuestionIndex++;
    displayQuestion();
}

async function finishQuiz() {
    console.log('Finishing quiz...');
    
    const correctAnswers = userAnswers.filter((answer, index) => 
        answer === currentQuiz[index].correctAnswer
    ).length;

    const score = Math.round((correctAnswers / currentQuiz.length) * 100);
    const performance = getPerformanceMessage(score);

    // Save results to backend if authenticated and check for new badges
    if (principal && backendActor) {
        try {
            console.log('Saving quiz result for principal:', principal.toText());
            
            // Get badge count before saving
            const previousBadgeCount = (await backendActor.getMyBadges()).length;
            
            // Save quiz result (this may award new badges)
            const updatedProfile = await backendActor.saveQuizResult(
                currentTopic, 
                score, 
                correctAnswers, 
                currentQuiz.length
            );
            
            console.log('Quiz result saved successfully:', updatedProfile);
            
            // Check for new badges
            await checkForNewBadges(previousBadgeCount);
            
        } catch (error) {
            console.error('Failed to save quiz result:', error);
        }
    }

    // Show results page
    showResultsPage(correctAnswers, currentQuiz.length, score, performance);
}

function showResultsPage(correctAnswers, totalQuestions, score, performance) {
    console.log('Showing results page...');
    
    // Hide all other sections
    document.getElementById('topicsSection').style.display = 'none';
    document.getElementById('quizSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'none';
    
    // Show results section
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';
    
    // Update results content
    document.getElementById('topicBadge').textContent = currentTopic.toUpperCase();
    document.getElementById('finalScore').textContent = `${score}%`;
    document.getElementById('scoreText').textContent = 
        `You got ${correctAnswers} out of ${totalQuestions} questions correct`;
    document.getElementById('performanceMessage').textContent = performance;

    // Add event listeners for result buttons
    document.getElementById('tryAgainBtn').onclick = function() {
        console.log('Try again clicked');
        generateQuiz(currentTopic);
    };
    
    document.getElementById('newTopicBtn').onclick = function() {
        console.log('New topic clicked');
        showSection('topicsSection');
    };
}

function getPerformanceMessage(score) {
    if (score >= 90) return "🌟 Excellent! You're a master of this topic!";
    if (score >= 80) return "👏 Great job! You have a solid understanding!";
    if (score >= 70) return "👍 Good work! You're on the right track!";
    if (score >= 60) return "📚 Not bad! A bit more practice will help!";
    return "💪 Keep studying! You'll improve with practice!";
}

function showTopics() {
    showSection('topicsSection');
    
    // Reset all quiz state
    currentTopic = '';
    currentQuiz = [];
    currentQuestionIndex = 0;
    userAnswers = [];
    isSubmitting = false;
    hasSubmittedAnswer = false;
}

function showQuizSection() {
    document.getElementById('topicsSection').style.display = 'none';
    document.getElementById('quizSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
}

function showLoading() {
    document.getElementById('quizContent').innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Generating your personalized quiz...</p>
            <small>This may take a few seconds</small>
        </div>
    `;
}

function showError(message) {
    document.getElementById('quizContent').innerHTML = `
        <div class="error-message">
            <div class="error-icon">⚠️</div>
            <h3>Oops! Something went wrong</h3>
            <p>${message}</p>
            <button onclick="showTopics()" class="retry-btn">Back to Topics</button>
        </div>
    `;
}

// Add keyboard navigation
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        showTopics();
    }
});
