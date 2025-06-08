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

const TOPIC_PROMPTS = {
  javascript: topic => `Generate 5 multiple choice questions about JavaScript programming. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  python: topic => `Generate 5 multiple choice questions about Python programming. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  blockchain: topic => `Generate 5 multiple choice questions about blockchain technology and cryptocurrency. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  ai: topic => `Generate 5 multiple choice questions about artificial intelligence and machine learning. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  webdev: topic => `Generate 5 multiple choice questions about web development. Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`,
  icp: topic => `Generate 5 multiple choice questions about Internet Computer Protocol (ICP). Each question should have 4 options, specify the correct answer (index 0-3), and provide a brief explanation.`
};

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { topic = "javascript", numQuestions = 5 } = req.body;
    console.log('Received request for topic:', topic);
    
    // Check if API key exists
    if (!PERPLEXITY_API_KEY) {
      throw new Error('Perplexity API key not found in environment variables');
    }
    
    const prompt = `${TOPIC_PROMPTS[topic] ? TOPIC_PROMPTS[topic](topic) : TOPIC_PROMPTS.javascript(topic)}

Format response as a valid JSON array:
[
  {
    "question": "What is the correct way to declare a variable in JavaScript?",
    "options": ["var x = 5", "variable x = 5", "declare x = 5", "x := 5"],
    "correctAnswer": 0,
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
        model: "sonar-pro", // ✅ FIXED: Using valid model name
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
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
    console.log('Full Perplexity response:', JSON.stringify(data, null, 2));

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
    console.log("Perplexity quiz text:", quizText);

    // Extract JSON from response
    let questions = [];
    try {
      // Remove markdown code fences if present
      let cleaned = quizText.trim();
      cleaned = cleaned.replace(/(`{3,6})(\w*)/g, ''); // ✅ FIXED: Proper regex syntax
      
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
        
      } else {
        throw new Error('No valid JSON array found in response');
      }
    } catch (err) {
      console.error("Failed to parse questions:", quizText);
      console.error("Parse error:", err.message);
      throw new Error(`Failed to parse quiz questions: ${err.message}`);
    }

    console.log(`Successfully generated ${questions.length} questions`);
    res.json({ success: true, questions });

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
        model: "sonar-pro", // ✅ FIXED: Using valid model name (was sonar-medium-online)
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!PERPLEXITY_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Bridge server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`🔑 API Key configured: ${!!PERPLEXITY_API_KEY}`);
});
