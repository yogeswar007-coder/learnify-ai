import { AuthClient } from '@dfinity/auth-client';
import { createActor } from '../../declarations/learnify_ai_backend';
import Chart from 'chart.js/auto';

// Topic colors mapping for pie chart
const TOPIC_COLORS = {
    'javascript': '#F7DF1E',      // JavaScript yellow
    'python': '#3776AB',          // Python blue
    'blockchain': '#F7931A',      // Bitcoin orange
    'ai': '#FF6B6B',             // AI red/pink
    'webdev': '#61DAFB',         // React cyan
    'icp': '#29ABE2',            // ICP blue
    'java': '#ED8B00',           // Java orange
    'react': '#61DAFB',          // React cyan
    'nodejs': '#339933',         // Node.js green
    'css': '#1572B6'             // CSS blue
};

// Global variables
let currentTopic = '';
let currentQuiz = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let isSubmitting = false;
let hasSubmittedAnswer = false;

// Quiz customization variables
let selectedDifficulty = 'medium';
let questionCount = 10;

let topicPieChartInstance;
// Auth variables
let authClient;
let identity;
let principal;
let backendActor;

// AI Tutor variables
let aiConversationHistory = [];

// Helper function to convert BigInt to Number safely
function bigIntToNumber(value) {
    if (typeof value === 'bigint') {
        return Number(value);
    }
    return value;
}

// Helper function to process profile data from Motoko
function processProfileData(profile) {
    return {
        principal: profile.principal,
        totalQuizzes: bigIntToNumber(profile.totalQuizzes),
        correctAnswers: bigIntToNumber(profile.correctAnswers),
        topicScores: profile.topicScores.map(([topic, score]) => [topic, bigIntToNumber(score)]),
        topicStats: profile.topicStats
            ? profile.topicStats.map(([topic, correct, incorrect]) => [
                  topic,
                  bigIntToNumber(correct),
                  bigIntToNumber(incorrect)
              ])
            : [],
        streak: bigIntToNumber(profile.streak),
        lastActive: bigIntToNumber(profile.lastActive),
        level: bigIntToNumber(profile.level),
        totalPoints: bigIntToNumber(profile.totalPoints)
    };
}


// Helper function to process badge data
function processBadgeData(badges) {
    return badges.map(badge => ({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        imageUrl: badge.imageUrl,
        criteria: badge.criteria,
        rarity: badge.rarity,
        earnedAt: bigIntToNumber(badge.earnedAt)
    }));
}

// Landing page functionality
function showLanding() {
    document.getElementById('main-page').style.display = 'block';
    document.getElementById('main-app').style.display = 'none';
    console.log('✅ Landing page displayed');
}

function showApp() {
    document.getElementById('main-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    console.log('✅ Main app displayed');
}

function showIdentityModal() {
    document.getElementById('identityModal').style.display = 'flex';
    console.log('✅ Identity modal shown');
}

function hideIdentityModal() {
    document.getElementById('identityModal').style.display = 'none';
    console.log('✅ Identity modal hidden');
}

// Setup landing page buttons
function setupLandingPageButtons() {
    // Landing page login buttons
    const landingLoginBtn = document.getElementById('landingLoginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const startLearningBtn = document.getElementById('startLearningBtn');
    const heroLoginBtn = document.getElementById('heroLoginBtn');
    
    if (landingLoginBtn) landingLoginBtn.addEventListener('click', showIdentityModal);
    if (signupBtn) signupBtn.addEventListener('click', showIdentityModal);
    if (startLearningBtn) startLearningBtn.addEventListener('click', showIdentityModal);
    if (heroLoginBtn) heroLoginBtn.addEventListener('click', showIdentityModal);
    
    // Modal buttons
    const closeIdentityModal = document.getElementById('closeIdentityModal');
    const internetIdentityLoginBtn = document.getElementById('internetIdentityLoginBtn');
    
    if (closeIdentityModal) closeIdentityModal.addEventListener('click', hideIdentityModal);
    if (internetIdentityLoginBtn) {
        internetIdentityLoginBtn.addEventListener('click', async () => {
            hideIdentityModal();
            await handleLogin();
        });
    }
    
    console.log('✅ Landing page buttons set up');
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupNameInputModal();
});

async function initializeApp() {
    console.log('🚀 Starting app initialization...');
    
    // Wait for EmailJS to load
    let emailJSRetries = 0;
    const maxRetries = 10;
    
    while (typeof emailjs === 'undefined' && emailJSRetries < maxRetries) {
        console.log(`⏳ Waiting for EmailJS to load... (${emailJSRetries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        emailJSRetries++;
    }
    
    if (typeof emailjs !== 'undefined') {
        console.log('✅ EmailJS loaded successfully');
        
        try {
            emailjs.init({
                publicKey: 'PmDcOAOwda5SSOtO9'
            });
            console.log('✅ EmailJS initialized with public key');
        } catch (error) {
            console.error('❌ EmailJS initialization error:', error);
        }
    } else {
        console.error('❌ EmailJS failed to load after retries');
    }

    // Initialize auth client with proper options
    authClient = await AuthClient.create({
        idleOptions: {
            disableIdle: true,
            disableDefaultIdleCallback: true
        }
    });

    // Check if already authenticated
    if (await authClient.isAuthenticated()) {
        console.log('🔐 User already authenticated');
        identity = authClient.getIdentity();
        principal = identity.getPrincipal();
        
        try {
            await initializeBackend();
            setupAuthenticatedUI();
            showApp(); // Show the main app instead of landing
            console.log('✅ Authentication and backend initialized successfully');
        } catch (error) {
            console.error('❌ Backend initialization failed:', error);
            await handleLogout();
            return;
        }
    } else {
        console.log('🔓 User not authenticated');
        setupUnauthenticatedUI();
        showLanding(); // Show landing page if not authenticated
    }

    setupEventListeners();
    setupLandingPageButtons(); // Add this line
    showSection('topicsSection');
    console.log('✅ App initialization complete');
}

async function initializeBackend() {
    try {
        const canisterId = process.env.CANISTER_ID_LEARNIFY_AI_BACKEND || 
                          process.env.LEARNIFY_AI_BACKEND_CANISTER_ID;
        
        if (!canisterId) {
            throw new Error('Backend canister ID not found in environment');
        }

        const host = process.env.DFX_NETWORK === 'local' ? 
                    'http://localhost:4943' : 
                    'https://ic0.app';

        backendActor = createActor(canisterId, {
            agentOptions: {
                identity,
                host
            }
        });
        
        await backendActor.getMyProfile();
        console.log('✅ Backend actor initialized and tested successfully');
        
    } catch (error) {
        console.error('❌ Backend initialization error:', error);
        throw error;
    }
}

function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Topic cards
    const topicCards = document.querySelectorAll('.topic-card');
    console.log('📋 Found topic cards:', topicCards.length);
    topicCards.forEach(card => {
        card.addEventListener('click', handleTopicSelection);
    });

    // Quiz customization event listeners
    setupQuizCustomizationListeners();

    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            console.log('🧭 Navigation clicked:', page);
            
            if ((page === 'dashboard' || page === 'badges') && !principal) {
                console.log('🔐 Authentication required for:', page);
                showIdentityModal();
                return;
            }
            
            showSection(page + 'Section');
        });
    });

    // Auth buttons (for main app)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        console.log('✅ Logout button listener attached');
    }

    // Back to topics button
    document.getElementById('backToTopics')?.addEventListener('click', showTopics);

    // Setup AI Tutor
    setupAITutor();

    // Setup feedback form
    setupFeedbackForm();
    
    console.log('✅ All event listeners set up');
}

function setupQuizCustomizationListeners() {
    console.log('🎯 Setting up quiz customization listeners...');
    
    // Back to topics from quiz options
    const backToTopicsBtn = document.getElementById('backToTopicsBtn');
    if (backToTopicsBtn) {
        backToTopicsBtn.addEventListener('click', () => {
            console.log('🔙 Going back to topics');
            showSection('topicsSection');
        });
        console.log('✅ Back to topics button listener attached');
    }

    // Difficulty selection
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('🎯 Difficulty button clicked:', this.dataset.difficulty);
            
            document.querySelectorAll('.difficulty-btn').forEach(b => {
                b.classList.remove('active');
            });
            
            this.classList.add('active');
            selectedDifficulty = this.dataset.difficulty;
            
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
            
            console.log('✅ Selected difficulty:', selectedDifficulty);
        });
    });

    // Question count controls
    document.querySelectorAll('.quantity-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('🔢 Quantity button clicked:', this.dataset.action);
            
            const input = document.getElementById('questionCount');
            let value = parseInt(input.value);
            
            if(this.dataset.action === 'increase' && value < 20) {
                value++;
            } else if(this.dataset.action === 'decrease' && value > 5) {
                value--;
            }
            
            input.value = value;
            questionCount = value;
            
            this.style.transform = 'scale(0.9)';
            setTimeout(() => {
                this.style.transform = '';
            }, 200);
            
            console.log('✅ Question count updated:', questionCount);
        });
    });

    // Start quiz button
    const startCustomQuizBtn = document.getElementById('startCustomQuizBtn');
    if (startCustomQuizBtn) {
        startCustomQuizBtn.addEventListener('click', async () => {
            console.log('🚀 Start quiz button clicked');
            
            const btn = document.getElementById('startCustomQuizBtn');
            btn.style.transform = 'scale(0.98)';
            btn.textContent = '⏳ Starting Quiz...';
            btn.disabled = true;
            
            console.log(`📊 Quiz params: ${currentTopic}, ${questionCount} questions, ${selectedDifficulty} difficulty`);
            
            try {
                await generateQuiz(currentTopic, questionCount, selectedDifficulty);
            } catch (error) {
                console.error('❌ Start quiz failed:', error);
                btn.textContent = '🚀 Start Quiz';
                btn.disabled = false;
                btn.style.transform = '';
                alert('Failed to start quiz: ' + error.message);
            }
        });
        console.log('✅ Start quiz button listener attached');
    }
    
    console.log('✅ Quiz customization listeners set up');
}

// Function to get user display name
function getUserDisplayName() {
    if (!principal) return 'User';
    
    const principalText = principal.toText();
    const storedName = localStorage.getItem(`userName_${principalText}`);
    
    if (storedName) {
        return storedName;
    } else {
        // First time user - show name input modal
        showNameInputModal();
        return 'User';
    }
}

// Show name input modal for first-time users
function showNameInputModal() {
    const modal = document.getElementById('nameInputModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
        
        // Focus on input
        setTimeout(() => {
            const input = document.getElementById('userNameInput');
            if (input) input.focus();
        }, 100);
    }
}

// Save user name
function saveUserName() {
    const nameInput = document.getElementById('userNameInput');
    const userName = nameInput.value.trim();
    
    if (!userName) {
        alert('Please enter your name');
        return;
    }
    
    if (userName.length > 20) {
        alert('Name must be 20 characters or less');
        return;
    }
    
    // Save to localStorage
    const principalText = principal.toText();
    localStorage.setItem(`userName_${principalText}`, userName);
    
    // Update display
    const userDisplayElement = document.getElementById('userDisplayName');
    if (userDisplayElement) {
        userDisplayElement.textContent = `${userName}`;
        userDisplayElement.style.display = 'block';
    }
    
    // Hide modal
    const modal = document.getElementById('nameInputModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    
    // Show welcome popup
    showLoginSuccessPopup(userName, true); // true = first time
}

// Show login success popup
function showLoginSuccessPopup(userName, isFirstTime = false) {
    const popup = document.getElementById('loginSuccess');
    const welcomeMessage = document.getElementById('loginWelcomeMessage');
    
    if (popup && welcomeMessage) {
        if (isFirstTime) {
            welcomeMessage.textContent = `Welcome to Learnify AI, ${userName}!`;
        } else {
            welcomeMessage.textContent = `Welcome back, ${userName}!`;
        }
        
        // Force display the popup
        popup.style.display = 'block';
        popup.classList.remove('hidden');
        popup.classList.add('active');
        
        console.log('✅ Login success popup displayed');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            popup.classList.remove('active');
            setTimeout(() => {
                popup.classList.add('hidden');
                popup.style.display = 'none';
            }, 300);
        }, 5000);
    } else {
        console.error('❌ Login success popup elements not found');
        console.log('Popup element:', popup);
        console.log('Welcome message element:', welcomeMessage);
    }
}

// Setup name input modal functionality
function setupNameInputModal() {
    const saveNameBtn = document.getElementById('saveUserName');
    const nameInput = document.getElementById('userNameInput');
    
    if (saveNameBtn) {
        saveNameBtn.addEventListener('click', saveUserName);
    }
    
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveUserName();
            }
        });
    }
}

async function handleLogin() {
    try {
        console.log('🔐 Login initiated...');
        
        identity = null;
        principal = null;
        backendActor = null;
        
        const identityProvider = process.env.DFX_NETWORK === 'local' 
            ? `http://localhost:4943/?canisterId=${process.env.CANISTER_ID_INTERNET_IDENTITY}`
            : 'https://identity.ic0.app';
            
        console.log('🔗 Using identity provider:', identityProvider);
            
        await authClient.login({
            identityProvider,
            maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
            onSuccess: async () => {
                console.log('✅ Login successful');
                identity = authClient.getIdentity();
                principal = identity.getPrincipal();
                
                try {
                    await initializeBackend();
                    setupAuthenticatedUI();
                    showApp();
                    
                    // Check if user has a stored name
                    const principalText = principal.toText();
                    const storedName = localStorage.getItem(`userName_${principalText}`);
                    
                    // Add delay to ensure UI is ready
                    setTimeout(() => {
                        if (!storedName) {
                            // First time user - show name input modal
                            console.log('🆕 First time user, showing name input modal');
                            showNameInputModal();
                        } else {
                            // Returning user - show welcome back popup
                            console.log('👋 Returning user, showing welcome back popup');
                            showLoginSuccessPopup(storedName, false);
                        }
                    }, 1000); // 1 second delay
                    
                    showSection('topicsSection');
                    console.log('✅ Post-login setup complete');
                } catch (backendError) {
                    console.error('❌ Post-login backend setup failed:', backendError);
                    alert('Login successful but backend connection failed. Please refresh the page.');
                }
            },
            onError: (error) => {
                console.error('❌ Login failed:', error);
                alert('Login failed. Please try again.');
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        alert('Login error. Please check your connection and try again.');
    }
}

async function handleLogout() {
    console.log('🔓 Logout initiated...');
    
    await authClient.logout();
    identity = null;
    principal = null;
    backendActor = null;
    setupUnauthenticatedUI();
    showLanding(); // Show landing page after logout
    
    console.log('✅ Logout complete');
}

function setupAuthenticatedUI() {
    console.log('🔧 Setting up authenticated UI...');
    
    // Get or set user display name
    const userName = getUserDisplayName();
    const userDisplayElement = document.getElementById('userDisplayName');
    if (userDisplayElement) {
        userDisplayElement.textContent = `${userName}`;
        userDisplayElement.style.display = 'block';
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
    
    console.log('✅ Authenticated UI setup complete');
}

function setupUnauthenticatedUI() {
    console.log('🔧 Setting up unauthenticated UI...');
    
    const userDisplayElement = document.getElementById('userDisplayName');
    if (userDisplayElement) {
        userDisplayElement.style.display = 'none';
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }
    
    console.log('✅ Unauthenticated UI setup complete');
}

function showSection(sectionId) {
    console.log('📄 Showing section:', sectionId);
    
    const sections = ['dashboardSection', 'topicsSection', 'badgesSection', 'feedbackSection', 'quizSection', 'resultsSection', 'quizOptionsSection', 'ai-tutorSection'];
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
            element.classList.add('hidden');
        }
    });

    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
        selectedSection.classList.remove('hidden');
        console.log('✅ Section displayed:', sectionId);
    } else {
        console.error('❌ Section not found:', sectionId);
    }

    updateNavigation(sectionId);
    
    if (sectionId === 'dashboardSection') {
        loadDashboard();
    } else if (sectionId === 'badgesSection') {
        loadBadges();
    } else if (sectionId === 'ai-tutorSection') {
        setupAITutor();
    }
}

function updateNavigation(sectionId) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const page = link.getAttribute('data-page');
        if (page + 'Section' === sectionId) {
            link.classList.add('active');
        }
    });
}


function updateTopicPieChart(topicScores) {
    // topicScores: [ [topic, quizzes_completed], ... ]
    const totalQuizzes = topicScores.reduce((sum, [_, count]) => sum + count, 0);
    const ctx = document.getElementById('topicAttemptsChart'); // FIXED: Changed from 'topicPieChart' to 'topicAttemptsChart'
    const noDataDiv = document.getElementById('noQuizData');
    
    if (!ctx) return;

    if (!totalQuizzes) {
        ctx.style.display = 'none';
        if (noDataDiv) noDataDiv.style.display = 'block';
        return;
    }

    ctx.style.display = 'block';
    if (noDataDiv) noDataDiv.style.display = 'none';

    // Calculate percentages and filter out 0%
    const topicPercentages = topicScores
        .map(([topic, count]) => [topic, +(count / totalQuizzes * 100).toFixed(2)])
        .filter(([_, percent]) => percent > 0);

    const labels = topicPercentages.map(([topic]) => topic.charAt(0).toUpperCase() + topic.slice(1));
    const data = topicPercentages.map(([_, percent]) => percent);

    // Use the TOPIC_COLORS mapping for consistent colors
    const backgroundColors = labels.map((label, index) => {
        const topicKey = label.toLowerCase();
        return TOPIC_COLORS[topicKey] || ['#43cea2', '#667eea', '#ffb347', '#ff6f91', '#26c6da', '#764ba2', '#43e97b'][index % 7];
    });

    if (topicPieChartInstance) topicPieChartInstance.destroy();

    topicPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: backgroundColors,
                borderColor: '#161b22',
                borderWidth: 3,
                hoverBorderWidth: 4,
                hoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#fff',
                        font: { 
                            family: "'Poppins', sans-serif", 
                            size: 14, 
                            weight: 'bold' 
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#43cea2',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}% (${percentage}% of total)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000
            }
        }
    });
}


// Enhanced Dashboard functionality
async function loadDashboard() {
    console.log('📊 Loading dashboard...');
    
    if (!principal || !backendActor) {
        console.log('❌ No authentication for dashboard');
        showLoginPrompt();
        return;
    }

    try {
        console.log('🔄 Fetching user data for principal:', principal.toText());
        
        const rawProfile = await backendActor.getMyProfile();
        const rawBadges = await backendActor.getMyBadges();
        
        const profile = processProfileData(rawProfile);
        const badges = processBadgeData(rawBadges);
        
        updateDashboardUI(profile, badges);
        
        console.log('✅ Dashboard loaded successfully');
        
    } catch (error) {
        console.error('❌ Dashboard load error:', error);
        showDashboardError('Failed to load dashboard: ' + error.message);
    }
}


function updateDashboardUI(profile, badges) {
    console.log('📊 Updating dashboard UI with profile:', profile);
    
    if (document.getElementById('totalQuizzes')) {
        document.getElementById('totalQuizzes').textContent = profile.totalQuizzes || 0;
    }
    if (document.getElementById('correctAnswers')) {
        document.getElementById('correctAnswers').textContent = profile.correctAnswers || 0;
    }
    
    const accuracy = profile.totalQuizzes > 0 ? 
        Math.round((profile.correctAnswers / (profile.totalQuizzes * questionCount)) * 100) : 0;
    if (document.getElementById('accuracy')) {
        document.getElementById('accuracy').textContent = accuracy + '%';
    }
    
    if (document.getElementById('currentStreak')) {
        document.getElementById('currentStreak').textContent = profile.streak || 0;
    }

    updateTopicScores(profile.topicScores || []);
    updateTopicPieChart(profile.topicScores || []);

}

function updateTopicScores(topicScores) {
    const container = document.getElementById('topicScores');
    if (!container) return;
    
    if (topicScores.length === 0) {
        container.innerHTML = '<p class="no-data">Complete quizzes to see topic stats!</p>';
        return;
    }

    container.innerHTML = topicScores.map(([topic, score]) => `
        <div class="topic-score-item">
            <span class="topic-name">${topic}</span>
            <div class="topic-score-bar">
                <div class="topic-score-fill" style="width: ${score}%"></div>
                <span class="topic-score-text">${score}%</span>
            </div>
        </div>
    `).join('');
}


function showLoginPrompt() {
    const currentSection = document.querySelector('.page-content:not(.hidden)') || document.getElementById('dashboardSection');
    if (currentSection) {
        currentSection.innerHTML = `
            <div class="container">
                <div class="login-prompt">
                    <h2>🔐 Login Required</h2>
                    <p>Please log in with Internet Identity to view your dashboard and track your progress.</p>
                    <button id="dashboardLoginBtn" class="auth-btn">Login with Internet Identity</button>
                </div>
            </div>
        `;
        
        document.getElementById('dashboardLoginBtn').addEventListener('click', () => {
            showIdentityModal();
        });
    }
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

// Badge functionality
async function loadBadges() {
    if (!principal || !backendActor) {
        showLoginPrompt();
        return;
    }

    try {
        const rawAllBadges = await backendActor.getAvailableBadges();
        const rawMyBadges = await backendActor.getMyBadges();
        
        const myBadges = processBadgeData(rawMyBadges);
        
        updateBadgesUI(rawAllBadges, myBadges);
        
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
        
        return `
            <div class="achievement-card ${isEarned ? 'earned' : 'locked'}">
                <span class="achievement-icon">${icon}</span>
                <h3>${name}</h3>
                <p>${description}</p>
                <span class="status ${isEarned ? 'status--success' : 'status--info'}">
                    ${isEarned ? 'Earned' : 'Not Earned Yet'}
                </span>
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

// Quiz functionality
function handleTopicSelection(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const card = event.currentTarget;
    currentTopic = card.dataset.topic;
    console.log('🎯 Selected topic:', currentTopic);
    
    card.style.transform = 'scale(0.98)';
    setTimeout(() => {
        card.style.transform = '';
        showQuizOptions(currentTopic);
    }, 150);
}

function showQuizOptions(topic) {
    console.log('📝 Showing quiz options for:', topic);
    showSection('quizOptionsSection');
    
    const topicDisplay = document.getElementById('selectedTopicDisplay');
    if (topicDisplay) {
        topicDisplay.textContent = topic.toUpperCase();
    }
    
    selectedDifficulty = 'medium';
    questionCount = 10;
    const questionCountInput = document.getElementById('questionCount');
    if (questionCountInput) {
        questionCountInput.value = questionCount;
    }
    
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.difficulty === selectedDifficulty) {
            btn.classList.add('active');
        }
    });
    
    const startBtn = document.getElementById('startCustomQuizBtn');
    if (startBtn) {
        startBtn.textContent = '🚀 Start Quiz';
        startBtn.disabled = false;
        startBtn.style.transform = '';
    }
}

async function generateQuiz(topic, numQuestions = 10, difficulty = 'medium') {
    console.log('🎲 Starting quiz generation...');
    
    showQuizSection();
    showLoading();
    
    currentQuestionIndex = 0;
    userAnswers = [];
    isSubmitting = false;
    hasSubmittedAnswer = false;

    try {
        console.log(`📝 Generating quiz for: ${topic}, ${numQuestions} questions, ${difficulty} difficulty`);
        
        const response = await fetch('http://localhost:4000/api/generate-quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                topic: topic,
                numQuestions: numQuestions,
                difficulty: difficulty
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📝 Quiz data received:', data);
        
        if (data.success && data.questions && data.questions.length > 0) {
            currentQuiz = data.questions;
            console.log('✅ Quiz stored, displaying first question...');
            
            setTimeout(() => {
                displayQuestion();
            }, 100);
        } else {
            showError('Failed to generate quiz. Please try again.');
        }
    } catch (error) {
        console.error('❌ Error generating quiz:', error);
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

    showSection('quizSection');
    
    const progressBar = document.getElementById('quiz-progress-bar');
    const progress = ((currentQuestionIndex + 1) / currentQuiz.length) * 100;
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }

    if (questionCounter) {
        questionCounter.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuiz.length} (${selectedDifficulty.toUpperCase()})`;
    }

    isSubmitting = false;
    hasSubmittedAnswer = false;

    if (quizContent) {
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
                <button id="submitAnswer" class="btn btn--primary" disabled>Submit Answer</button>
            </div>
        `;

        const options = quizContent.querySelectorAll('.option');
        const submitBtn = quizContent.querySelector('#submitAnswer');
        
        options.forEach(option => {
            option.addEventListener('click', function() {
                if (hasSubmittedAnswer) return;
                
                options.forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            });
        });

        if (submitBtn) {
            submitBtn.addEventListener('click', submitAnswer);
        }
    }

    console.log('✅ Question displayed:', question.question);
}

async function submitAnswer() {
    if (isSubmitting || hasSubmittedAnswer) {
        console.log('Submission already in progress or completed');
        return;
    }
    
    const selectedOption = document.querySelector('.option.selected');
    if (!selectedOption) return;

    isSubmitting = true;
    hasSubmittedAnswer = true;
    
    const submitBtn = document.getElementById('submitAnswer');
    const options = document.querySelectorAll('.option');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    options.forEach(option => {
        option.style.pointerEvents = 'none';
    });

    const userAnswer = parseInt(selectedOption.dataset.option);
    const question = currentQuiz[currentQuestionIndex];
    
    userAnswers.push(userAnswer);

    options.forEach((option, index) => {
        if (index === question.correctAnswer) {
            option.classList.add('correct');
        } else if (index === userAnswer && userAnswer !== question.correctAnswer) {
            option.classList.add('incorrect');
        }
    });

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

    isSubmitting = false;

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
    console.log('🏁 Finishing quiz...');
    
    const correctAnswers = userAnswers.filter((answer, index) => 
        answer === currentQuiz[index].correctAnswer
    ).length;

    const score = Math.round((correctAnswers / currentQuiz.length) * 100);
    const performance = getPerformanceMessage(score);

    if (principal && backendActor) {
        try {
            console.log('💾 Saving quiz result...');
            
            await backendActor.saveQuizResult(
                currentTopic, 
                score, 
                correctAnswers, 
                currentQuiz.length
            );
            
            console.log('✅ Quiz result saved successfully');
            
        } catch (error) {
            console.error('❌ Failed to save quiz result:', error);
        }
    }

    showResultsPage(correctAnswers, currentQuiz.length, score, performance);
}

function showResultsPage(correctAnswers, totalQuestions, score, performance) {
    console.log('🎉 Showing results page...');
    
    showSection('resultsSection');
    
    const topicBadge = document.getElementById('topicBadge');
    if (topicBadge) {
        topicBadge.textContent = currentTopic.toUpperCase();
    }
    
    const difficultyBadge = document.getElementById('difficultyBadge');
    if (difficultyBadge) {
        difficultyBadge.textContent = selectedDifficulty.toUpperCase();
    }
    
    const finalScore = document.getElementById('finalScore');
    if (finalScore) {
        finalScore.textContent = `${score}%`;
    }
    
    const scoreText = document.getElementById('scoreText');
    if (scoreText) {
        scoreText.textContent = `You got ${correctAnswers} out of ${totalQuestions} questions correct`;
    }
    
    const performanceMessage = document.getElementById('performanceMessage');
    if (performanceMessage) {
        performanceMessage.textContent = performance;
    }

    const tryAgainBtn = document.getElementById('tryAgainBtn');
    if (tryAgainBtn) {
        tryAgainBtn.onclick = null;
        tryAgainBtn.addEventListener('click', function() {
            console.log('🔄 Try again clicked');
            showQuizOptions(currentTopic);
        });
    }
    
    const newTopicBtn = document.getElementById('newTopicBtn');
    if (newTopicBtn) {
        newTopicBtn.onclick = null;
        newTopicBtn.addEventListener('click', function() {
            console.log('🏠 New topic clicked');
            showSection('topicsSection');
        });
    }
    
    console.log('✅ Results page displayed successfully');
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
    
    currentTopic = '';
    currentQuiz = [];
    currentQuestionIndex = 0;
    userAnswers = [];
    isSubmitting = false;
    hasSubmittedAnswer = false;
}

function showQuizSection() {
    console.log('📺 Showing quiz section');
    
    const sections = ['topicsSection', 'quizOptionsSection', 'dashboardSection', 'resultsSection', 'badgesSection', 'feedbackSection', 'ai-tutorSection'];
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
            element.classList.add('hidden');
        }
    });
    
    const quizSection = document.getElementById('quizSection');
    if (quizSection) {
        quizSection.style.display = 'block';
        quizSection.classList.remove('hidden');
        console.log('✅ Quiz section is now visible');
    } else {
        console.error('❌ Quiz section element not found!');
    }
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

// AI Tutor functionality
function setupAITutor() {
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');

    if (chatInput && sendButton) {
        chatInput.removeEventListener('keypress', handleChatKeypress);
        sendButton.removeEventListener('click', sendMessage);
        
        chatInput.addEventListener('keypress', handleChatKeypress);
        sendButton.addEventListener('click', sendMessage);
    }
}

function handleChatKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';
    
    const typingIndicator = showTypingIndicator();

    const greetings = ['hi', 'hello', 'hey', 'greetings', 'hi there'];
    const isGreeting = greetings.some(greet => message.toLowerCase().includes(greet));

    if (isGreeting) {
        setTimeout(() => {
            removeTypingIndicator(typingIndicator);
            addMessage("Hello! I'm your AI Tutor Assistant. How can I help you learn today?", 'assistant');
        }, 1000);
    } else {
        const messages = [
            {
                role: "system",
                content: "You are a friendly and helpful AI tutor. Respond to users as if you are a chat bot, always being welcoming and clear. Reply in a clear, well-structured way. Use paragraphs, bullet points, or numbered lists for complex answers. Do not include any citations or reference numbers like [1], [2]. Do not generate, process, or analyze images. If asked about images, explain that you cannot work with images and suggest text-based alternatives."
            },
            ...aiConversationHistory,
            { role: "user", content: message }
        ];

        try {
            const response = await fetch('http://localhost:4000/api/ai-tutor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messages })
            });

            removeTypingIndicator(typingIndicator);

            let aiReply = '';
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.reply) {
                    aiReply = removeCitations(data.reply);
                    aiReply = formatChatbotReply(aiReply);
                } else {
                    aiReply = "Sorry, I couldn't generate a response. Please try again.";
                }
            } else {
                const errorData = await response.json();
                console.error('AI Tutor server error:', errorData);
                aiReply = "⚠️ Sorry, I'm having trouble connecting. Please make sure the bridge server is running.";
            }

            addMessage(aiReply, 'assistant');

            aiConversationHistory.push(
                { role: "user", content: message },
                { role: "assistant", content: aiReply }
            );

        } catch (error) {
            removeTypingIndicator(typingIndicator);
            addMessage("⚠️ Sorry, I'm having trouble connecting. Please make sure the bridge server is running on port 4000.", 'assistant');
            console.error('AI Tutor error:', error);
        }
    }
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.innerHTML = `
        <div class="message-content">${text}</div>
        <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return null;
    
    const typing = document.createElement('div');
    typing.className = 'message assistant typing';
    typing.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    messagesContainer.appendChild(typing);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return typing;
}

function removeTypingIndicator(typingElement) {
    if (typingElement && typingElement.parentElement) {
        typingElement.remove();
    }
}

function removeCitations(text) {
    return text.replace(/\[\d+\]/g, '');
}

function formatChatbotReply(text) {
    text = text.replace(/\[\d+\]/g, '');
    text = text.replace(/\n\n/g, '<br><br>');
    return text;
}

// Email validation helper
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

// Show notification helper
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// FIXED Feedback functionality
function setupFeedbackForm() {
    console.log('📝 Setting up feedback form...');
    
    // Star rating interaction
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            document.querySelectorAll('.star').forEach((s, index) => {
                s.classList.toggle('active', index < value);
                s.setAttribute('aria-checked', index < value ? 'true' : 'false');
            });
            document.getElementById('ratingValue').value = value;
            console.log('⭐ Rating selected:', value);
        });
        
        // Add keyboard accessibility
        star.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                star.click();
            }
        });
    });

    // Form submission with proper EmailJS integration
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('📝 Feedback form submitted');
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            // Validate required fields
            const rating = document.getElementById('ratingValue').value;
            const email = e.target.user_email.value;
            const message = e.target.message.value;
            const featureRequest = e.target.feature_request.value;
            
            if (!rating) {
                showNotification('Please select a rating', 'error');
                return;
            }
            
            if (email && !validateEmail(email)) {
                showNotification('Please enter a valid email address', 'error');
                return;
            }
            
            // Disable submit button and show loading
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-disabled', 'true');
            submitBtn.textContent = 'Sending...';
            
            const loadingDots = submitBtn.querySelector('.loading-dots');
            if (loadingDots) {
                loadingDots.classList.remove('hidden');
            }
            
            try {
                if (typeof emailjs !== 'undefined') {
                    console.log('📧 Sending email via EmailJS...');
                    
                    // Prepare template parameters
                    const templateParams = {
                        user_email: email || 'anonymous@learnify.ai',
                        rating: rating,
                        message: message,
                        feature_request: featureRequest,
                        timestamp: new Date().toLocaleString(),
                        user_principal: principal ? principal.toText().substring(0, 10) + '...' : 'Anonymous'
                    };
                    
                    const result = await emailjs.send(
                        'service_imevsnl',  // Your service ID
                        'template_orponyg', // Your template ID
                        templateParams
                    );
                    
                    console.log('✅ Email sent successfully:', result);
                    showFeedbackSuccess();
                    
                    // Reset form
                    e.target.reset();
                    document.querySelectorAll('.star').forEach(star => {
                        star.classList.remove('active');
                        star.setAttribute('aria-checked', 'false');
                    });
                    
                } else {
                    console.warn('⚠ EmailJS not available, simulating success');
                    // Simulate success for testing
                    setTimeout(() => {
                        showFeedbackSuccess();
                        e.target.reset();
                        document.querySelectorAll('.star').forEach(star => {
                            star.classList.remove('active');
                            star.setAttribute('aria-checked', 'false');
                        });
                    }, 1000);
                }
                
            } catch (error) {
                console.error('❌ Failed to send feedback:', error);
                showNotification('Failed to send feedback. Please try again later.', 'error');
            } finally {
                // Reset submit button
                submitBtn.disabled = false;
                submitBtn.setAttribute('aria-disabled', 'false');
                submitBtn.textContent = originalText;
                
                if (loadingDots) {
                    loadingDots.classList.add('hidden');
                }
            }
        });
        
        console.log('✅ Feedback form event listeners attached');
    } else {
        console.error('❌ Feedback form not found');
    }
}

function showFeedbackSuccess() {
    console.log('🎉 Showing feedback success message');
    
    const success = document.getElementById('feedbackSuccess');
    if (success) {
        success.classList.remove('hidden');
        success.classList.add('active');

        const slider = document.querySelector('.success-slider');
        if (slider) {
            slider.style.animation = 'none';
            void slider.offsetWidth; // Force reflow
            slider.style.animation = 'sliderIn 4s ease-out forwards';
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            success.classList.remove('active');
            setTimeout(() => success.classList.add('hidden'), 500);
        }, 5000);
    }
    
    // Also show a notification
    showNotification('Thank you for your feedback! 🎉', 'success');
}


// Add keyboard navigation
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        showTopics();
    }
});

// Make functions globally available
window.showSection = showSection;
window.loadDashboard = loadDashboard;
window.loadBadges = loadBadges;
window.showTopics = showTopics;
window.saveUserName = saveUserName;
window.showLanding = showLanding;
window.showApp = showApp;

console.log('📄 Main.js loaded successfully with landing page integration');
