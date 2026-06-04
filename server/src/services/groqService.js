const OpenAI = require('openai');
const config = require('../config');
const { ValidationError } = require('../utils/errors/errorTypes');

class GroqService {
  constructor() {
    // OpenAI clients are cached by `${baseURL}|${apiKey}` so we don't rebuild
    // one per call. The active key is resolved per request (configured AI
    // connection first, env fallback second) — see `_resolve`.
    this._clients = new Map();
    if (!config.ai.apiKey) {
      console.log('ℹ AI: no env key set — relying on configured AI connections (Settings → AI Connections).');
    }
  }

  _clientFor(apiKey, baseURL) {
    const cacheKey = `${baseURL}|${apiKey}`;
    if (!this._clients.has(cacheKey)) {
      this._clients.set(cacheKey, new OpenAI({ apiKey, baseURL }));
    }
    return this._clients.get(cacheKey);
  }

  /**
   * Resolve the AI client + model to use. Prefers a configured AI connection
   * (personal routing → org routing → any org key) and falls back to the env
   * config. Returns { enabled, client, model }.
   */
  async _resolve(feature = null, userId = null) {
    let cfg = null;
    try {
      // Lazy require avoids any load-order cycle (db ↔ services).
      const aiConnectionService = require('./aiConnectionService');
      cfg = await aiConnectionService.resolveActiveConfig(feature, userId);
    } catch (e) {
      console.error('[AI] connection resolve failed, falling back to env:', e.message);
    }
    if (!cfg && config.ai.apiKey) {
      cfg = { apiKey: config.ai.apiKey, baseURL: config.ai.baseURL, model: config.ai.model, provider: config.ai.provider };
    }
    if (!cfg) return { enabled: false };
    return {
      enabled: true,
      client: this._clientFor(cfg.apiKey, cfg.baseURL),
      model: cfg.model || config.ai.model
    };
  }

  /**
   * Generate roadmap using Groq AI
   */
  async generateRoadmap(params) {
    const ai = await this._resolve();
    if (!ai.enabled) {
      throw new ValidationError('AI is not configured. Add a provider key in Settings → AI Connections.');
    }

    const {
      programName,
      programDescription,
      programType,
      levelName,
      levelDuration,
      learningOutcomes,
      prerequisites,
      tags,
      additionalInstructions
    } = params;

    const prompt = this.createRoadmapPrompt({
      programName,
      programDescription,
      programType,
      levelName,
      levelDuration,
      learningOutcomes,
      prerequisites,
      tags,
      additionalInstructions
    });

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum designer. You MUST respond with ONLY valid, properly escaped JSON. No markdown, no explanations, just pure JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000
      });

      let content = response.choices[0].message.content.trim();
      
      console.log('📥 Raw Groq response length:', content.length);
      console.log('📥 First 200 chars:', content.substring(0, 200));
      console.log('📥 Last 200 chars:', content.substring(content.length - 200));
      
      // Try multiple extraction methods
      let jsonContent = content;
      
      // Method 1: Extract from markdown code blocks
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        console.log('✓ Extracted JSON from markdown code block');
        jsonContent = codeBlockMatch[1];
      }
      
      // Method 2: Find first { to last }
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        const extracted = content.substring(firstBrace, lastBrace + 1);
        if (!codeBlockMatch) {
          console.log('✓ Extracted JSON using brace matching');
          jsonContent = extracted;
        }
      }
      
      // Clean up common JSON issues
      jsonContent = this.sanitizeJSON(jsonContent);
      
      console.log('🔧 Cleaned JSON length:', jsonContent.length);
      
      let roadmapData;
      try {
        roadmapData = JSON.parse(jsonContent);
        console.log('✓ JSON parsed successfully');
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError.message);
        console.error('📄 Failed content (first 1000 chars):', jsonContent.substring(0, 1000));
        console.error('📄 Around error position:', jsonContent.substring(Math.max(0, parseError.message.match(/\d+/)?.[0] - 100), parseError.message.match(/\d+/)?.[0] + 100));
        console.error('📄 Failed content (last 500 chars):', jsonContent.substring(jsonContent.length - 500));
        
        // Try one more time with aggressive fixing
        try {
          const fixed = this.aggressiveJSONFix(jsonContent);
          roadmapData = JSON.parse(fixed);
          console.log('✓ JSON parsed after aggressive fix');
        } catch (secondError) {
          throw new Error(`JSON parsing failed: ${parseError.message}`);
        }
      }
      
      return this.validateAndFormatRoadmap(roadmapData, levelDuration);
    } catch (error) {
      console.error(`❌ Groq API Error:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
       
      // Handle specific API errors with user-friendly messages
      let userMessage = `Failed to generate roadmap: ${error.message}`;
      
      if (error.message.includes('413') || error.message.includes('Request too large')) {
        userMessage = 'Roadmap generation request is too large. Please try with fewer weeks or simpler requirements.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        userMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        userMessage = 'API authentication failed. Please check your Groq API key.';
      } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
        userMessage = 'Groq service is temporarily unavailable. Please try again later.';
      }
      
      throw new ValidationError(userMessage);
    }
  }

  /**
   * Sanitize JSON content - fix common issues
   */
  sanitizeJSON(content) {
    return content
      .replace(/\r\n/g, ' ')   // Replace Windows line endings
      .replace(/\n/g, ' ')     // Replace newlines with spaces
      .replace(/\r/g, '')      // Remove carriage returns
      .replace(/\t/g, ' ')     // Replace tabs with spaces
      .replace(/\s+/g, ' ')    // Collapse multiple spaces
      .replace(/,\s*}/g, '}')  // Remove trailing commas before }
      .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
      .trim();
  }

  /**
   * Aggressive JSON fix - try to salvage malformed JSON
   */
  aggressiveJSONFix(content) {
    let fixed = content;
    
    // Fix common issues
    fixed = fixed
      .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
      .replace(/([}\]])(\s*)([{[])/g, '$1,$2$3')  // Add missing commas between objects/arrays
      .replace(/"([^"]*)"(\s*):/g, '"$1":')  // Ensure proper key formatting
      .replace(/:\s*'([^']*)'/g, ':"$1"')  // Replace single quotes with double
      .replace(/\\'/g, "'")  // Unescape single quotes
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');  // Remove control characters
    
    return fixed;
  }

  /**
   * Create prompt for roadmap generation
   */
  createRoadmapPrompt(params) {
    const {
      programName,
      programDescription,
      programType,
      levelName,
      levelDuration,
      learningOutcomes,
      prerequisites,
      tags,
      additionalInstructions
    } = params;

    return `Generate a detailed learning roadmap for a ${programType} program.

**Program Details:**
- Name: ${programName}
- Description: ${programDescription}
- Level: ${levelName}
- Duration: ${levelDuration} weeks
- Skills/Tags: ${tags?.join(', ') || 'Not specified'}
- Prerequisites: ${prerequisites || 'None'}

**Learning Outcomes:**
${learningOutcomes?.map((outcome, i) => `${i + 1}. ${outcome}`).join('\n') || 'Not specified'}

**Additional Instructions:**
${additionalInstructions || 'None'}

**Requirements:**
Create a ${levelDuration}-week roadmap with:
1. Each week should have a clear title and 2-4 learning objectives
2. Each week should contain 3-5 tasks (mix of reading, practical exercises, and projects)
3. Tasks should progressively increase in difficulty
4. Include estimated hours for each task (realistic for working professionals)
5. Define clear acceptance criteria for each task
6. Specify deliverables (what the learner should submit)
7. Include a weekly milestone

**Task Types:**
- reading: Reading articles, documentation, books
- video: Watching tutorials, courses
- exercise: Practice problems, coding challenges
- project: Build something practical
- quiz: Knowledge assessment
- discussion: Group discussion or mentor check-in

**Difficulty Levels:**
- easy: Beginner-friendly, foundational concepts
- medium: Requires understanding of basics, practical application
- hard: Complex concepts, integration of multiple skills
- expert: Advanced, requires deep understanding

**Output Format (JSON):**
You MUST return ONLY valid JSON. Do NOT include any markdown formatting, explanations, or extra text.
Make sure all strings are properly escaped and there are no unterminated strings.

Respond with this exact structure:
{
  "totalWeeks": ${levelDuration},
  "weeks": [
    {
      "weekNumber": 1,
      "title": "Week title here",
      "objectives": ["objective 1", "objective 2", "objective 3"],
      "milestone": "What learner should achieve by end of week",
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed task description",
          "type": "reading",
          "difficulty": "medium",
          "estimatedHours": 5,
          "orderIndex": 1,
          "acceptanceCriteria": ["criteria 1", "criteria 2"],
          "deliverable": "What to submit"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- Return ONLY the JSON object
- NO markdown code blocks (no \`\`\`)
- NO explanations before or after the JSON
- Ensure all quotes are properly escaped
- Make sure all strings are complete (no unterminated strings)
- Keep descriptions concise (max 200 characters each)`;
  }

  /**
   * Validate and format roadmap data
   */
  validateAndFormatRoadmap(roadmapData, expectedWeeks) {
    if (!roadmapData || !roadmapData.weeks || !Array.isArray(roadmapData.weeks)) {
      throw new ValidationError('Invalid roadmap format received from AI');
    }

    if (roadmapData.weeks.length !== expectedWeeks) {
      console.warn(`Expected ${expectedWeeks} weeks, got ${roadmapData.weeks.length}. Adjusting...`);
    }

    // Ensure week numbers are sequential
    roadmapData.weeks = roadmapData.weeks.map((week, index) => ({
      ...week,
      weekNumber: index + 1,
      tasks: week.tasks?.map((task, taskIndex) => ({
        ...task,
        orderIndex: taskIndex + 1,
        acceptanceCriteria: Array.isArray(task.acceptanceCriteria) 
          ? task.acceptanceCriteria 
          : [],
        estimatedHours: parseInt(task.estimatedHours) || 5
      })) || []
    }));

    roadmapData.totalWeeks = roadmapData.weeks.length;

    return roadmapData;
  }

  /**
   * Generate adaptive recommendations
   */
  async generateAdaptiveRecommendations(params) {
    const ai = await this._resolve();
    if (!ai.enabled) {
      return { recommendations: [], confidence: 0 };
    }

    const {
      menteeId,
      currentLevel,
      performanceMetrics,
      completedTasks,
      strugglingAreas,
      strengths
    } = params;

    const prompt = `Analyze learner performance and suggest roadmap adaptations.

**Learner Profile:**
- Current Level: ${currentLevel}
- Tasks Completed: ${completedTasks}
- Average Score: ${performanceMetrics?.averageScore || 'N/A'}
- Average Time: ${performanceMetrics?.averageTimeSpent || 'N/A'} hours per task

**Struggling Areas:**
${strugglingAreas?.map((area, i) => `${i + 1}. ${area}`).join('\n') || 'None identified'}

**Strengths:**
${strengths?.map((strength, i) => `${i + 1}. ${strength}`).join('\n') || 'None identified'}

Based on this data, provide recommendations for roadmap adaptation:
1. Should we add remedial tasks? Which topics?
2. Should we skip any basic tasks? Which ones?
3. Should we add bonus/challenge tasks? Which areas?
4. Should we adjust estimated time for upcoming tasks?

Output as JSON:
{
  "recommendations": [
    {
      "type": "add_task|remove_task|adjust_time|add_resource",
      "description": "What to do",
      "reason": "Why this helps",
      "priority": "high|medium|low"
    }
  ],
  "confidence": 0.85,
  "summary": "Brief summary of learner progress and recommendations"
}`;

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert learning analytics specialist who provides personalized learning path recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('OpenAI Adaptive Recommendations Error:', error);
      return { recommendations: [], confidence: 0, summary: 'Unable to generate recommendations' };
    }
  }

  /**
   * Generate mentor-mentee matching score
   */
  async generateMatchingScore(mentorProfile, menteeProfile, programRequirements) {
    const ai = await this._resolve();
    if (!ai.enabled) {
      // Fallback to simple rule-based matching
      return this.calculateBasicMatchScore(mentorProfile, menteeProfile);
    }

    const prompt = `Analyze mentor-mentee compatibility for a mentorship program.

**Mentor Profile:**
- Skills: ${mentorProfile.skills?.join(', ') || 'Not specified'}
- Experience: ${mentorProfile.yearsExperience || 'Not specified'} years
- Specialization: ${mentorProfile.specialization || 'Not specified'}
- Current Load: ${mentorProfile.currentMentees || 0}/${mentorProfile.maxMentees || 5}
- Success Rate: ${mentorProfile.successRate || 'N/A'}%

**Mentee Profile:**
- Learning Goals: ${menteeProfile.learningGoals?.join(', ') || 'Not specified'}
- Current Skills: ${menteeProfile.skills?.join(', ') || 'Beginner'}
- Learning Style: ${menteeProfile.learningStyle || 'Not specified'}

**Program Requirements:**
- Required Skills: ${programRequirements.skills?.join(', ') || 'Not specified'}
- Level: ${programRequirements.level || 'Not specified'}

Provide a compatibility analysis with a score from 0-100.

Output as JSON:
{
  "score": 85,
  "breakdown": {
    "skillMatch": 90,
    "availabilityMatch": 85,
    "experienceMatch": 80,
    "styleMatch": 85
  },
  "reasoning": "Brief explanation of the score",
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1"] or []
}`;

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in mentor-mentee matching for professional development programs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('OpenAI Matching Score Error:', error);
      return this.calculateBasicMatchScore(mentorProfile, menteeProfile);
    }
  }

  /**
   * Score ALL mentors against a single mentee in ONE API call.
   * Returns an array of { mentorId, score, breakdown, reasoning, strengths, concerns }.
   * Falls back to calculateBasicMatchScore per mentor when AI is unavailable.
   */
  async batchGenerateMatchingScores(mentors, menteeProfile, programRequirements) {
    const ai = await this._resolve();
    if (!ai.enabled || mentors.length === 0) {
      return mentors.map(m => ({
        mentorId: m.id,
        ...this.calculateBasicMatchScore(m, menteeProfile)
      }));
    }

    // Each mentor entry uses the same field names as generateMatchingScore's mentorProfile,
    // with an added `id` so results can be mapped back.
    const mentorList = mentors.map(m => ({
      id: m.id,
      skills: m.skills?.join(', ') || 'Not specified',
      yearsExperience: m.yearsExperience || 'Not specified',
      specialization: m.specialization || 'Not specified',
      currentMentees: m.currentMentees || 0,
      maxMentees: m.maxMentees || 5,
      successRate: m.successRate || 'N/A'
    }));

    const prompt = `You are an expert in mentor-mentee matching for professional development programs.

Score each mentor's compatibility with the given mentee. Return one entry per mentor.

**Mentee Profile:**
- Learning Goals: ${menteeProfile.learningGoals?.join(', ') || 'Not specified'}
- Current Skills: ${menteeProfile.skills?.join(', ') || 'Beginner'}
- Learning Style: ${menteeProfile.learningStyle || 'Not specified'}
- Prior Experience: ${menteeProfile.priorExperience || 'None'}

**Program Requirements:**
- Required Skills: ${programRequirements.skills?.join(', ') || 'Not specified'}
- Level: ${programRequirements.level || 'Not specified'}

**Mentors to evaluate:**
${mentorList.map(m => `
Mentor ID: ${m.id}
- Skills: ${m.skills}
- Experience: ${m.yearsExperience} years
- Specialization: ${m.specialization}
- Current Load: ${m.currentMentees}/${m.maxMentees}
- Success Rate: ${m.successRate}%`).join('\n')}

For each mentor provide a compatibility score 0-100.

Output as JSON:
{
  "results": [
    {
      "mentorId": "<id>",
      "score": 85,
      "breakdown": { "skillMatch": 90, "availabilityMatch": 85, "experienceMatch": 80, "styleMatch": 85 },
      "reasoning": "Brief explanation of the score",
      "strengths": ["strength 1", "strength 2"],
      "concerns": []
    }
  ]
}`;

    try {
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: 'system', content: 'You are an expert in mentor-mentee matching. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.results || [];
    } catch (error) {
      console.error('Groq batchGenerateMatchingScores error, falling back to basic scoring:', error.message);
      return mentors.map(m => ({
        mentorId: m.id,
        ...this.calculateBasicMatchScore(m, menteeProfile)
      }));
    }
  }


  /**
   * Fallback basic matching score calculation
   */
  calculateBasicMatchScore(mentorProfile, menteeProfile) {
    let score = 50; // Base score

    // Skill matching
    const mentorSkills = mentorProfile.skills || [];
    const menteeNeeds = menteeProfile.learningGoals || [];
    const skillMatch = mentorSkills.filter(skill => 
      menteeNeeds.some(need => need.toLowerCase().includes(skill.toLowerCase()))
    );
    score += (skillMatch.length / Math.max(menteeNeeds.length, 1)) * 30;

    // Availability
    const availabilityScore = 
      ((mentorProfile.maxMentees - mentorProfile.currentMentees) / mentorProfile.maxMentees) * 20;
    score += availabilityScore;

    return {
      score: Math.min(Math.round(score), 100),
      breakdown: {
        skillMatch: Math.min(score * 0.4, 40),
        availabilityMatch: Math.min(availabilityScore, 20),
        experienceMatch: 25,
        styleMatch: 15
      },
      reasoning: 'Basic rule-based matching (AI matching unavailable)',
      strengths: skillMatch.length > 0 ? ['Skill alignment'] : [],
      concerns: mentorProfile.currentMentees >= mentorProfile.maxMentees ? ['Mentor at capacity'] : []
    };
  }
}

module.exports = new GroqService();
