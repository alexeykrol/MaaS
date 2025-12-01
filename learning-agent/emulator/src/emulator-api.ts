import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../shared/db';
import { createChatCompletion } from '../../../shared/openai';
import { logger } from '../../../shared/logger';

/**
 * User Emulator API v0.3.0
 *
 * Generates synthetic Student/Mentor dialogs.
 *
 * TWO MODES:
 * - DIRECT: OpenAI direct calls (no memory between dialogs)
 * - PIPELINE: Routes through MaaS pipeline (uses LSM memory!)
 *
 * Endpoints:
 * - POST /api/emulator/generate    - Generate dialogs
 * - GET  /api/emulator/status      - Get current status
 * - POST /api/emulator/mode        - Set mode (direct/pipeline)
 */

const router = Router();

// Emulation mode
type EmulationMode = 'direct' | 'pipeline';
let currentMode: EmulationMode = 'direct';

interface EmulationConfig {
  studentPrompt: string;
  mentorPrompt: string;
  topic: string;
  dialogCount: number;
  turnsPerDialog: number;
  mode?: EmulationMode;
}

interface GeneratedMessage {
  role: 'student' | 'mentor';
  content: string;
  timestamp: string;
  user_id: string;
  source: 'direct' | 'pipeline';
}

interface GeneratedDialog {
  dialog_id: string;
  topic: string;
  messages: GeneratedMessage[];
  created_at: string;
}

// Active emulation state
let isEmulating = false;
let currentEmulation: {
  config: EmulationConfig;
  progress: number;
  total: number;
  dialogs: GeneratedDialog[];
  mode: EmulationMode;
} | null = null;

/**
 * POST /api/emulator/mode
 * Set emulation mode
 */
router.post('/mode', (req: Request, res: Response) => {
  const { mode } = req.body;

  if (mode !== 'direct' && mode !== 'pipeline') {
    return res.status(400).json({
      success: false,
      error: 'Invalid mode. Must be "direct" or "pipeline"'
    });
  }

  currentMode = mode;
  logger.info(`[Emulator] Mode set to: ${mode}`);

  res.json({
    success: true,
    mode: currentMode,
    description: mode === 'pipeline'
      ? 'Mentor responses will use MaaS pipeline with LSM memory'
      : 'Direct OpenAI calls (no cross-dialog memory)'
  });
});

/**
 * GET /api/emulator/mode
 * Get current mode
 */
router.get('/mode', (req: Request, res: Response) => {
  res.json({
    success: true,
    mode: currentMode,
    description: currentMode === 'pipeline'
      ? 'Pipeline mode: Uses MaaS memory'
      : 'Direct mode: No cross-dialog memory'
  });
});

/**
 * POST /api/emulator/generate
 * Generate Student/Mentor dialogs
 */
router.post('/generate', async (req: Request, res: Response) => {
  if (isEmulating) {
    return res.status(409).json({
      success: false,
      error: 'Emulation already in progress',
      progress: currentEmulation?.progress,
      total: currentEmulation?.total
    });
  }

  const mode = req.body.mode || currentMode;

  const config: EmulationConfig = {
    studentPrompt: req.body.studentPrompt || 'You are a curious student learning programming.',
    mentorPrompt: req.body.mentorPrompt || 'You are an experienced programming mentor.',
    topic: req.body.topic || 'General programming concepts',
    dialogCount: Math.min(req.body.dialogCount || 3, 10),
    turnsPerDialog: Math.min(req.body.turnsPerDialog || 4, 10),
    mode
  };

  // In pipeline mode, use SAME user_id across dialogs for memory!
  // In direct mode, fresh IDs each time
  const studentUserId = uuidv4();
  const mentorUserId = mode === 'pipeline' ? studentUserId : uuidv4(); // Pipeline: same user for memory

  logger.info('[Emulator] Starting generation', {
    mode,
    topic: config.topic,
    dialogs: config.dialogCount,
    turns: config.turnsPerDialog,
    studentUserId,
    mentorUserId
  });

  isEmulating = true;
  currentEmulation = {
    config,
    progress: 0,
    total: config.dialogCount,
    dialogs: [],
    mode
  };

  try {
    const dialogs: GeneratedDialog[] = [];

    for (let d = 0; d < config.dialogCount; d++) {
      currentEmulation.progress = d + 1;

      const dialog = await generateDialog(
        config,
        studentUserId,
        mentorUserId,
        d + 1,
        mode
      );

      dialogs.push(dialog);
      currentEmulation.dialogs.push(dialog);
    }

    logger.info('[Emulator] Generation complete', {
      mode,
      dialogsGenerated: dialogs.length,
      totalMessages: dialogs.reduce((sum, d) => sum + d.messages.length, 0)
    });

    res.json({
      success: true,
      mode,
      config: {
        topic: config.topic,
        dialogCount: config.dialogCount,
        turnsPerDialog: config.turnsPerDialog
      },
      userIds: {
        student: studentUserId,
        mentor: mentorUserId
      },
      dialogs
    });
  } catch (error: any) {
    logger.error('[Emulator] Generation failed', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    isEmulating = false;
    currentEmulation = null;
  }
});

/**
 * GET /api/emulator/status
 * Get current emulation status
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    isEmulating,
    mode: currentEmulation?.mode || currentMode,
    progress: currentEmulation?.progress || 0,
    total: currentEmulation?.total || 0,
    dialogsCompleted: currentEmulation?.dialogs.length || 0
  });
});

/**
 * Generate a single dialog with multiple turns
 */
async function generateDialog(
  config: EmulationConfig,
  studentUserId: string,
  mentorUserId: string,
  dialogNumber: number,
  mode: EmulationMode
): Promise<GeneratedDialog> {
  const dialogId = uuidv4();
  const messages: GeneratedMessage[] = [];
  const conversationHistory: Array<{ role: 'student' | 'mentor'; content: string }> = [];

  logger.info(`[Emulator] Generating dialog #${dialogNumber} (${mode} mode)...`);

  for (let turn = 0; turn < config.turnsPerDialog; turn++) {
    // 1. Generate student message (direct OR pipeline)
    let studentMessage: string;
    let studentSource: 'direct' | 'pipeline';

    if (mode === 'pipeline') {
      // Route through MaaS pipeline - both roles use MaaS!
      // Include the meta-prompt so MaaS knows the role
      const studentQuery = turn === 0
        ? `[ROLE INSTRUCTION: ${config.studentPrompt}]\n\nTopic: ${config.topic}\n\nGenerate a student's opening question about this topic.`
        : `[ROLE INSTRUCTION: ${config.studentPrompt}]\n\nTopic: ${config.topic}\n\nGenerate a follow-up question from the student.`;

      studentMessage = await getResponseViaPipeline(studentUserId, studentQuery, 'student');
      studentSource = 'pipeline';
    } else {
      // Direct OpenAI call - no memory
      studentMessage = await generateStudentMessage(
        config.studentPrompt,
        config.topic,
        conversationHistory,
        turn === 0
      );
      studentSource = 'direct';
      await storeMessage(studentUserId, 'student', studentMessage, dialogId, turn);
    }

    const studentMsg: GeneratedMessage = {
      role: 'student',
      content: studentMessage,
      timestamp: new Date().toISOString(),
      user_id: studentUserId,
      source: studentSource
    };
    messages.push(studentMsg);
    conversationHistory.push({ role: 'student', content: studentMessage });

    // 2. Generate mentor response (direct OR pipeline)
    let mentorMessage: string;
    let mentorSource: 'direct' | 'pipeline';

    if (mode === 'pipeline') {
      // Route through MaaS pipeline - both roles use MaaS!
      // Include the meta-prompt so MaaS knows the role
      const mentorQuery = `[ROLE INSTRUCTION: ${config.mentorPrompt}]\n\nStudent's question: "${studentMessage}"\n\nRespond as the mentor.`;

      mentorMessage = await getResponseViaPipeline(studentUserId, mentorQuery, 'mentor');
      mentorSource = 'pipeline';
    } else {
      // Direct OpenAI call - no memory
      mentorMessage = await generateMentorMessage(
        config.mentorPrompt,
        config.topic,
        conversationHistory
      );
      mentorSource = 'direct';
      await storeMessage(studentUserId, 'mentor', mentorMessage, dialogId, turn);
    }

    const mentorMsg: GeneratedMessage = {
      role: 'mentor',
      content: mentorMessage,
      timestamp: new Date().toISOString(),
      user_id: studentUserId,
      source: mentorSource
    };
    messages.push(mentorMsg);
    conversationHistory.push({ role: 'mentor', content: mentorMessage });
  }

  return {
    dialog_id: dialogId,
    topic: config.topic,
    messages,
    created_at: new Date().toISOString()
  };
}

/**
 * Get response via MaaS pipeline (with memory!)
 * Used for both Student and Mentor roles
 */
async function getResponseViaPipeline(
  userId: string,
  query: string,
  role: 'student' | 'mentor',
  timeoutMs: number = 60000
): Promise<string> {
  logger.info(`[Emulator] Routing ${role} to MaaS pipeline...`);

  // 1. Insert into pipeline_runs
  const result = await pool.query(
    `INSERT INTO pipeline_runs (user_id, user_query, status)
     VALUES ($1, $2, 'NEW')
     RETURNING id`,
    [userId, query]
  );
  const pipelineRunId = result.rows[0].id;

  logger.info(`[Emulator] Created pipeline_run: ${pipelineRunId}`);

  // 2. Wait for completion
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const statusResult = await pool.query(
      'SELECT status, final_answer, error_message FROM pipeline_runs WHERE id = $1',
      [pipelineRunId]
    );

    const row = statusResult.rows[0];

    if (row.status === 'COMPLETED') {
      logger.info(`[Emulator] Pipeline completed in ${Date.now() - startTime}ms`);
      return row.final_answer || 'No response generated';
    }

    if (row.status === 'FAILED') {
      throw new Error(`Pipeline failed: ${row.error_message}`);
    }

    // Still processing
    await sleep(pollInterval);
  }

  throw new Error(`Pipeline timeout after ${timeoutMs}ms. Is Orchestrator running?`);
}

/**
 * Generate a student message (direct OpenAI)
 */
async function generateStudentMessage(
  metaPrompt: string,
  topic: string,
  history: Array<{ role: string; content: string }>,
  isFirst: boolean
): Promise<string> {
  const systemPrompt = `${metaPrompt}

You are having a learning conversation about: ${topic}

Guidelines:
- Ask genuine questions that show curiosity
- Build on previous answers in the conversation
- Show when you're confused or need clarification
- Be concise (2-3 sentences max)
${isFirst ? '- Start the conversation by introducing what you want to learn' : '- Continue the conversation naturally'}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role === 'student' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  if (!isFirst) {
    messages.push({
      role: 'user',
      content: 'Continue as the student. What would you say or ask next?'
    });
  }

  const response = await createChatCompletion({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.8,
    max_tokens: 200
  });

  return response.trim();
}

/**
 * Generate a mentor response (direct OpenAI - no memory)
 */
async function generateMentorMessage(
  metaPrompt: string,
  topic: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const systemPrompt = `${metaPrompt}

You are having a teaching conversation about: ${topic}

Guidelines:
- Guide with questions rather than direct answers
- Help the student discover insights themselves
- Be encouraging but accurate
- Be concise (2-4 sentences max)`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role === 'student' ? 'user' : 'assistant',
      content: msg.content
    });
  }

  const response = await createChatCompletion({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 300
  });

  return response.trim();
}

/**
 * Store message in raw_logs table
 */
async function storeMessage(
  userId: string,
  role: string,
  content: string,
  dialogId: string,
  turn: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO raw_logs (user_id, log_type, log_data)
       VALUES ($1, $2, $3)`,
      [
        userId,
        'EMULATED_MESSAGE',
        JSON.stringify({
          role: role === 'student' ? 'user' : 'assistant',
          content,
          source: 'emulator',
          dialog_id: dialogId,
          turn,
          emulated_role: role
        })
      ]
    );
  } catch (error: any) {
    logger.error('[Emulator] Failed to store message', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default router;
