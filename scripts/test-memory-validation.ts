/**
 * Memory Validation Test
 *
 * Проверяет, что ассистент действительно ИСПОЛЬЗУЕТ память в ответах,
 * а не просто формирует правильный контекст.
 */

import { pool } from '../src/utils/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const testUserId = '00000000-0000-0000-0000-000000000001';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendQuery(query: string): Promise<{ answer: string; context: string }> {
  const result = await pool.query(
    `INSERT INTO pipeline_runs (user_id, user_query, status)
     VALUES ($1, $2, 'NEW')
     RETURNING id`,
    [testUserId, query]
  );

  const pipelineId = result.rows[0].id;

  // Wait for completion
  let attempts = 0;
  while (attempts < 60) {
    await sleep(500);
    attempts++;

    const statusResult = await pool.query(
      'SELECT status, final_answer, final_context_payload FROM pipeline_runs WHERE id = $1',
      [pipelineId]
    );

    const status = statusResult.rows[0].status;

    if (status === 'COMPLETED') {
      return {
        answer: statusResult.rows[0].final_answer,
        context: statusResult.rows[0].final_context_payload
      };
    } else if (status === 'FAILED') {
      throw new Error('Pipeline failed');
    }
  }

  throw new Error('Timeout');
}

async function runArchivist(): Promise<void> {
  console.log('   🤖 Running Archivist...');
  await execAsync('npx ts-node scripts/run-archivist.ts');
  console.log('   ✅ Archivist completed\n');
}

async function testMemoryValidation() {
  try {
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('🧪 Memory Validation Test - Does AI actually USE memory?');
    console.log('═'.repeat(80));
    console.log('\n');

    // Phase 1: Create conversation with specific facts
    console.log('📝 Phase 1: Creating conversation with specific facts');
    console.log('─'.repeat(80));

    const factQueries = [
      "My favorite food is sushi, especially salmon nigiri.",
      "I'm allergic to peanuts, so I always avoid them.",
      "I love spicy food - the hotter the better!"
    ];

    for (const [index, query] of factQueries.entries()) {
      console.log(`\n   Statement ${index + 1}: "${query}"`);
      const result = await sendQuery(query);
      console.log(`   Response: ${result.answer.substring(0, 100)}...`);
    }

    console.log('\n   ✅ Conversation created\n');

    // Phase 2: Archive to LSM
    console.log('📚 Phase 2: Archive to LSM');
    console.log('─'.repeat(80));
    await runArchivist();

    // Phase 3: Test memory recall with specific question
    console.log('🧠 Phase 3: Memory Recall Test');
    console.log('─'.repeat(80));

    const memoryQuestion = "What do you know about my food preferences?";
    console.log(`\n   Question: "${memoryQuestion}"\n`);

    const memoryResult = await sendQuery(memoryQuestion);

    console.log('   📄 AI Response:');
    console.log('   ' + '─'.repeat(76));
    const lines = memoryResult.answer.split('\n');
    lines.forEach(line => console.log(`   ${line}`));
    console.log('   ' + '─'.repeat(76));
    console.log('');

    // Validation: Check if answer mentions specific facts
    const answer = memoryResult.answer.toLowerCase();
    const context = memoryResult.context.toLowerCase();

    console.log('📊 Memory Usage Validation:');
    console.log('─'.repeat(80));

    // Check context formation
    const hasLSM = context.includes('previous context');
    const hasRecentConversation = context.includes('recent conversation');

    console.log(`   Context Formation:`);
    console.log(`      ${hasLSM ? '✅' : '❌'} LSM included in context`);
    console.log(`      ${hasRecentConversation ? '✅' : '❌'} Recent conversation included`);
    console.log('');

    // Check if answer actually references the facts
    const mentionsSushi = answer.includes('sushi') || answer.includes('salmon');
    const mentionsAllergy = answer.includes('peanut') || answer.includes('allerg');
    const mentionsSpicy = answer.includes('spicy') || answer.includes('hot');

    console.log(`   Answer References Specific Facts:`);
    console.log(`      ${mentionsSushi ? '✅' : '❌'} Mentions sushi/salmon preference`);
    console.log(`      ${mentionsAllergy ? '✅' : '❌'} Mentions peanut allergy`);
    console.log(`      ${mentionsSpicy ? '✅' : '❌'} Mentions love for spicy food`);
    console.log('');

    const memoryScore = [mentionsSushi, mentionsAllergy, mentionsSpicy].filter(Boolean).length;

    console.log('═'.repeat(80));
    if (memoryScore >= 2) {
      console.log('✅ MEMORY SYSTEM VALIDATED - AI uses memory in responses!');
      console.log(`   Score: ${memoryScore}/3 facts referenced`);
    } else {
      console.log('❌ MEMORY USAGE ISSUE - AI may not be using memory properly');
      console.log(`   Score: ${memoryScore}/3 facts referenced`);
      console.log('   Context was formed but answer may not reference it');
    }
    console.log('═'.repeat(80));
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testMemoryValidation();
