const OpenAI = require('openai');
const config = require('../config');
const { BadRequestError } = require('../utils/errors/errorTypes');

class OpenAIService {
  constructor() {
    if (!config.openai.apiKey) {
      console.warn('OpenAI API key not configured. AI features will be disabled.');
      this.enabled = false;
      return;
    }

    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
    this.enabled = true;
  }

  /**
   * Generate roadmap using OpenAI
   */
  async generateRoadmap(params) {
    if (!this.enabled) {
      throw new BadRequestError('AI roadmap generation is not available. Please configure OpenAI API key.');
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum designer and educational content creator. You create structured, practical learning roadmaps for professional development programs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const roadmapData = JSON.parse(response.choices[0].message.content);
      return this.validateAndFormatRoadmap(roadmapData, levelDuration);
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new BadRequestError(`Failed to generate roadmap: ${error.message}`);
    }
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
{
  "totalWeeks": ${levelDuration},
  "weeks": [
    {
      "weekNumber": 1,
      "title": "Week title",
      "objectives": ["objective 1", "objective 2"],
      "milestone": "What learner should achieve by end of week",
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed task description with what to do",
          "type": "reading|video|exercise|project|quiz|discussion",
          "difficulty": "easy|medium|hard|expert",
          "estimatedHours": 5,
          "orderIndex": 1,
          "acceptanceCriteria": ["criteria 1", "criteria 2"],
          "deliverable": "What to submit (e.g., GitHub link, written summary, screenshot)"
        }
      ]
    }
  ]
}

Generate the complete roadmap now.`;
  }

  /**
   * Validate and format roadmap data
   */
  validateAndFormatRoadmap(roadmapData, expectedWeeks) {
    if (!roadmapData || !roadmapData.weeks || !Array.isArray(roadmapData.weeks)) {
      throw new BadRequestError('Invalid roadmap format received from AI');
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
    if (!this.enabled) {
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
      const response = await this.client.chat.completions.create({
        model: this.model,
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
    if (!this.enabled) {
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
      const response = await this.client.chat.completions.create({
        model: this.model,
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

module.exports = new OpenAIService();
