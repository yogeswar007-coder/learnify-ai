import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PPLX_URL = "https://api.perplexity.ai/chat/completions";

// Topic prompts with difficulty and question count support
const TOPIC_PROMPTS = {
  javascript: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about JavaScript programming at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  python: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about Python programming at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  blockchain: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about blockchain technology and cryptocurrency at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  ai: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about artificial intelligence and machine learning at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  webdev: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about web development at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  icp: (topic, difficulty, numQuestions) => `Generate ${numQuestions} multiple choice questions about Internet Computer Protocol (ICP) at ${difficulty} difficulty level. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`
};

// Store connected clients for real-time updates
const connectedClients = new Set();

// Function to shuffle array (Fisher-Yates shuffle)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to randomize question options
function randomizeQuestionOptions(question) {
  const originalOptions = [...question.options];
  const originalCorrectAnswer = question.correctAnswer;
  
  // Create array of indices and shuffle them
  const indices = [0, 1, 2, 3];
  const shuffledIndices = shuffleArray(indices);
  
  // Reorder options based on shuffled indices
  const newOptions = shuffledIndices.map(index => originalOptions[index]);
  
  // Find where the original correct answer ended up
  const newCorrectAnswer = shuffledIndices.indexOf(originalCorrectAnswer);
  
  return {
    ...question,
    options: newOptions,
    correctAnswer: newCorrectAnswer
  };
}

// Generate quiz with difficulty and question count
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { topic = "javascript", numQuestions = 5, difficulty = "medium" } = req.body;
    console.log(`Received request for topic: ${topic}, questions: ${numQuestions}, difficulty: ${difficulty}`);
    
    // Check if API key exists
    if (!PERPLEXITY_API_KEY) {
      throw new Error('Perplexity API key not found in environment variables');
    }
    
    // Use updated prompt with difficulty and question count
    const promptFunction = TOPIC_PROMPTS[topic] || TOPIC_PROMPTS.javascript;
    const basePrompt = promptFunction(topic, difficulty, numQuestions);
    
    const prompt = `${basePrompt}

Difficulty guidelines:
- Easy: Basic concepts, straightforward questions, fundamental syntax
- Medium: Intermediate concepts, some problem-solving, practical applications
- Hard: Advanced concepts, complex scenarios, edge cases, optimization

IMPORTANT: Randomize the correct answer position. Do NOT always put the correct answer as the first option. Mix up the correct answer positions across different questions.

Format response as a valid JSON array:
[
  {
    "question": "What is the correct way to declare a variable in JavaScript?",
    "options": ["variable x = 5", "var x = 5", "declare x = 5", "x := 5"],
    "correctAnswer": 1,
    "explanation": "In JavaScript, 'var' is one of the ways to declare a variable."
  }
]
NO markdown, NO extra text, ONLY the JSON array.`;

    console.log('Making request to Perplexity API...');
    
    const response = await fetch(PPLX_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 0.9 : 0.8 // Higher temperature for more randomness
      })
    });

    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API Error:', response.status, response.statusText);
      console.error('Error details:', errorText);
      throw new Error(`Perplexity API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Full Perplexity response received');

    // Check if the response has the expected structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Unexpected API response structure - no choices array:', data);
      throw new Error('Invalid response structure from Perplexity API - no choices found');
    }

    if (!data.choices[0].message || !data.choices[0].message.content) {
      console.error('Unexpected API response structure - no message content:', data.choices[0]);
      throw new Error('Invalid response structure from Perplexity API - no message content');
    }

    const quizText = data.choices[0].message.content;
    console.log("Perplexity quiz text received");

    // Extract JSON from response
    let questions = [];
    try {
      // Remove markdown code fences if present
      let cleaned = quizText.trim();
      cleaned = cleaned.replace(/(`{3,6})(\w*)/g, '');
      
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
        
        // Validate the questions structure
        if (!Array.isArray(questions) || questions.length === 0) {
          throw new Error('Parsed questions is not a valid array');
        }
        
        // Validate each question has required fields
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctAnswer !== 'number') {
            throw new Error(`Question ${i + 1} has invalid structure`);
          }
        }
        
        // IMPORTANT: Randomize the options for each question
        console.log('🔀 Randomizing question options to prevent pattern bias...');
        questions = questions.map((question, index) => {
          const randomizedQuestion = randomizeQuestionOptions(question);
          console.log(`Question ${index + 1}: Correct answer moved from position ${question.correctAnswer} to position ${randomizedQuestion.correctAnswer}`);
          return randomizedQuestion;
        });
        
      } else {
        throw new Error('No valid JSON array found in response');
      }
    } catch (err) {
      console.error("Failed to parse questions:", quizText);
      console.error("Parse error:", err.message);
      throw new Error(`Failed to parse quiz questions: ${err.message}`);
    }

    console.log(`✅ Successfully generated ${questions.length} questions at ${difficulty} difficulty with randomized options`);
    res.json({ 
      success: true, 
      questions,
      metadata: {
        topic,
        difficulty,
        questionCount: questions.length,
        randomized: true
      }
    });

  } catch (error) {
    console.error('Quiz generation error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate quiz',
      details: error.message 
    });
  }
});

// Grade answer endpoint
app.post('/api/grade-answer', async (req, res) => {
  try {
    const { topic, question, userAnswer, correctAnswer, explanation } = req.body;
    const isCorrect = userAnswer === correctAnswer;
    
    // Check if API key exists
    if (!PERPLEXITY_API_KEY) {
      console.log('API key not found, using fallback explanation');
      return res.json({ 
        success: true, 
        isCorrect,
        feedback: explanation || 'No explanation available.'
      });
    }
    
    const prompt = `User answered option ${userAnswer} to: "${question}". The correct answer was option ${correctAnswer}. Original explanation: "${explanation}". Provide encouraging feedback (max 50 words) that ${isCorrect ? 'congratulates them and adds an interesting fact' : 'gently explains why their answer was incorrect and provides the correct answer'}.`;

    console.log('Grading answer with Perplexity...');
    
    const response = await fetch(PPLX_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity grading error:', response.status, response.statusText);
      console.error('Error details:', errorText);
      // Fallback to original explanation
      return res.json({ 
        success: true, 
        isCorrect,
        feedback: explanation || 'No explanation available.'
      });
    }

    const data = await response.json();
    
    // Check response structure
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('Unexpected grading response structure:', data);
      // Fallback to original explanation
      return res.json({ 
        success: true, 
        isCorrect,
        feedback: explanation || 'No explanation available.'
      });
    }

    const feedback = data.choices[0].message.content.trim();
    console.log('Generated feedback:', feedback);

    res.json({ 
      success: true, 
      isCorrect,
      feedback: feedback || explanation || 'No explanation available.'
    });

  } catch (error) {
    console.error('Grading error:', error.message);
    // Always provide a fallback response for grading
    res.json({ 
      success: true, 
      isCorrect: req.body.userAnswer === req.body.correctAnswer,
      feedback: req.body.explanation || 'No explanation available.'
    });
  }
});

// AI Tutor endpoint
app.post('/api/ai-tutor', async (req, res) => {
  try {
    const { messages } = req.body;
    console.log('AI Tutor request received with', messages.length, 'messages');
    
    // Check if API key exists
    if (!PERPLEXITY_API_KEY) {
      console.log('API key not found for AI Tutor');
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured'
      });
    }
    
    console.log('Making AI Tutor request to Perplexity API...');
    
    const response = await fetch(PPLX_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: messages,
        max_tokens: 512,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity AI Tutor Error:', response.status, response.statusText);
      console.error('Error details:', errorText);
      throw new Error(`Perplexity API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log('AI Tutor response received');

    // Check response structure
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('Unexpected AI Tutor response structure:', data);
      throw new Error('Invalid response structure from Perplexity API');
    }

    const aiReply = data.choices[0].message.content.trim();
    console.log('AI Tutor reply generated successfully');

    res.json({ 
      success: true, 
      reply: aiReply
    });

  } catch (error) {
    console.error('AI Tutor error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get AI response',
      details: error.message 
    });
  }
});

// Server-Sent Events endpoint for real-time dashboard updates
app.get('/dashboard-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Add client to connected clients
  connectedClients.add(res);
  console.log(`📡 New SSE client connected. Total clients: ${connectedClients.size}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connection',
    message: 'Connected to real-time updates',
    timestamp: Date.now()
  })}\n\n`);

  // Send periodic heartbeat
  const heartbeat = setInterval(() => {
    if (res.destroyed) {
      clearInterval(heartbeat);
      connectedClients.delete(res);
      return;
    }
    
    res.write(`data: ${JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now()
    })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    connectedClients.delete(res);
    console.log(`📡 SSE client disconnected. Total clients: ${connectedClients.size}`);
  });

  req.on('error', (err) => {
    console.error('SSE client error:', err);
    clearInterval(heartbeat);
    connectedClients.delete(res);
  });
});

// Function to broadcast real-time updates to all connected clients
function broadcastUpdate(updateData) {
  const message = `data: ${JSON.stringify(updateData)}\n\n`;
  
  connectedClients.forEach(client => {
    if (!client.destroyed) {
      try {
        client.write(message);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        connectedClients.delete(client);
      }
    } else {
      connectedClients.delete(client);
    }
  });
  
  console.log(`📡 Broadcasted update to ${connectedClients.size} clients:`, updateData.type);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!PERPLEXITY_API_KEY,
    connectedClients: connectedClients.size
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Bridge server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`📡 Real-time updates available at http://localhost:${PORT}/dashboard-updates`);
  console.log(`🤖 AI Tutor available at http://localhost:${PORT}/api/ai-tutor`);
  console.log(`🔑 API Key configured: ${!!PERPLEXITY_API_KEY}`);
  console.log(`🔀 Quiz randomization: ENABLED`);
});
