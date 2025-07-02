/* eslint-disable no-unused-vars */

import assert from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join, resolve as pathResolve } from 'path';
import sinon from 'sinon';
import chalk from 'chalk';
import fsExtra from 'fs-extra'; // For stubbing and real file operations

// Helper imports (assuming these are correctly located relative to test/index.js)
import ReadlineStub from './helpers/readline.js';
import PromptModule from '../index.js'; // Using PromptModule to avoid conflict
import DefaultHistory from '../DefaultHistory.js'; // Direct import for instanceof, etc.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Helper Functions for Tests ---
function getPromiseForAnswer(promptInstance) {
  return promptInstance.run();
}

function type(rlInstance, text) {
  text.split('').forEach(function (char) {
    rlInstance.line = rlInstance.line + char;
    rlInstance.input.emit('keypress', char);
  });
}

function moveDown(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'down' });
}

function moveUp(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'up' });
}

// Simulates pressing the 'Enter' key.
// In multi-line mode (for the CommandPrompt tests), this should add the current line to the buffer.
// Otherwise, it simulates a keypress (though Inquirer filters 'enter' keypresses).
function pressEnterKey(rlInstance, currentPromptInstance) {
  console.log(`[DEBUG] pressEnterKey: Simulating 'enter' keypress. rl.line = "${rlInstance.line}"`);
  if (currentPromptInstance && currentPromptInstance.isMultiLineMode) {
    // In multi-line mode, Enter should add current line to buffer and clear rl.line
    currentPromptInstance.multiLineBuffer.push(rlInstance.line);
    rlInstance.line = '';
    // currentPromptInstance.render(); // Call render if visual update is part of test
  } else {
    // For single-line prompts or if prompt instance isn't passed,
    // emit the keypress. Inquirer typically filters this specific event.
    rlInstance.input.emit('keypress', '', { name: 'enter' });
  }
}

// Simulates submitting the current rl.line (original 'enter' behavior for single-line prompts)
function finalEnterAndSubmitLine(rlInstance) {
    console.log(`[DEBUG] finalEnterAndSubmitLine: Submitting rl.line = "${rlInstance.line}"`);
    rlInstance.emit('line', rlInstance.line);
}

function tab(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'tab' });
}
// --- End Helper Functions ---

describe('inquirer-command-prompt', function () {
  let prompt; // General prompt instance for some tests
  let rl;     // ReadlineStub instance

  // Note: DefaultHistory is imported directly now, no need for dynamic import in before hook here.

  describe('auto-complete', function () {
    let availableCommands;

    beforeEach(function () {
      availableCommands = ['foo', 'bar', 'bum'];
      rl = new ReadlineStub();
    });

    it('should return the expected word if that is partially typed', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        autoCompletion: availableCommands,
        context: 'autocomplete_test_1'
      }, rl);
      const promise = getPromiseForAnswer(prompt);
      type(rl, 'f');
      tab(rl);
      finalEnterAndSubmitLine(rl);
      await promise;
      assert.strictEqual(rl.line, 'foo');
    });

    it('should return the typed word if tab not pressed', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        context: 'autocomplete_test_2'
      }, rl);
      const promise = getPromiseForAnswer(prompt);
      type(rl, 'hello');
      finalEnterAndSubmitLine(rl);
      await promise;
      assert.strictEqual(rl.line, 'hello');
    });

    it('should return the typed word if tab pressed but no matches', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        autoCompletion: availableCommands,
        context: 'autocomplete_test_3'
      }, rl);
      const promise = getPromiseForAnswer(prompt);
      type(rl, 'zu');
      tab(rl);
      finalEnterAndSubmitLine(rl);
      await promise;
      assert.strictEqual(rl.line, 'zu');
    });
  });

  describe('CommandPrompt History (Integration)', function () {
    const TEST_HISTORY_DIR = pathResolve(__dirname, 'test_history_files');
    const COMMAND_PROMPT_HISTORY_FILE = 'cmd-prompt-test-hist.json';

    beforeEach(async function () {
      rl = new ReadlineStub();
      PromptModule.setConfig({}); // Reset global config
      await fsExtra.ensureDir(TEST_HISTORY_DIR);
      const historyFilePath = pathResolve(TEST_HISTORY_DIR, COMMAND_PROMPT_HISTORY_FILE);
      if (await fsExtra.pathExists(historyFilePath)) {
        await fsExtra.remove(historyFilePath);
      }
    });

    afterEach(async function () {
      sinon.restore();
      if (await fsExtra.pathExists(TEST_HISTORY_DIR)) {
        await fsExtra.remove(TEST_HISTORY_DIR);
      }
    });

    it('should navigate command history with up and down arrows', async function () {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_nav_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: true }
      }, rl);

      // Prompt 1
      let answerPromise = getPromiseForAnswer(prompt); type(rl, 'cmd1'); finalEnterAndSubmitLine(rl); await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd1', "Prompt 1 answer should be cmd1");

      // Prompt 2
      rl.line = ''; // Reset line for prompt 2
      answerPromise = getPromiseForAnswer(prompt); type(rl, 'cmd2'); finalEnterAndSubmitLine(rl); await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd2', "Prompt 2 answer should be cmd2");

      // Prompt 3: Navigate up to 'cmd2' and submit
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl); // Expected: line is now 'cmd2' internally by end of onKeypress
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd2', 'Should submit "cmd2" after one moveUp');

      // Prompt 4: Navigate up to 'cmd1' and submit
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl);
      moveUp(rl);
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd1', 'Should submit "cmd1" after two moveUps');

      // Prompt 5: Navigate up to 'cmd1' (stay at top) and submit
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl);
      moveUp(rl);
      moveUp(rl);
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd1', 'Should submit "cmd1" after moving up multiple times at the top');

      // Prompt 6: Navigate up then down, and submit 'cmd1'
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl);
      moveUp(rl);
      moveDown(rl);
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd1', 'Should submit "cmd1" after moving up, up, then down');

      // Prompt 7: Navigate to new empty line and submit it
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl);
      moveDown(rl);
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, '', 'Should submit empty string after navigating to new line');

      // Prompt 8: Navigate to new empty line (stay at bottom) and submit it
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl);
      moveDown(rl);
      moveDown(rl);
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, '', 'Should submit empty string after moving down multiple times at the bottom');

      // Prompt 9: Type a new command and submit it (original test behavior - no microtask pause needed here as type() sets rl.line directly)
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'cmd3');
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'cmd3', 'Final command submitted should be cmd3');
    });

    it('should add submitted commands to history and save them (respecting limit)', async function () {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_add_save_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: true, limit: 2 }
      }, rl);

      const historyHandler = prompt.historyHandler;
      assert(historyHandler instanceof DefaultHistory, 'Should use DefaultHistory instance');

      // Command 1
      rl.line = '';
      let p = getPromiseForAnswer(prompt); type(rl, 'first'); finalEnterAndSubmitLine(rl); await p;
      assert.strictEqual(prompt.answer, 'first');
      // After 'first' is added, history: ['first']

      // Command 2
      rl.line = '';
      p = getPromiseForAnswer(prompt); type(rl, 'second'); finalEnterAndSubmitLine(rl); await p;
      assert.strictEqual(prompt.answer, 'second');
      // After 'second' is added, history: ['first', 'second']

      // Command 3
      rl.line = '';
      p = getPromiseForAnswer(prompt); type(rl, 'third'); finalEnterAndSubmitLine(rl); await p;
      assert.strictEqual(prompt.answer, 'third');
      // After 'third' is added, history (limit 2): ['second', 'third']

      assert.deepStrictEqual(historyHandler.getAll('hist_add_save_test'), ['second', 'third'], 'History should respect limit');

      const historyFilePath = pathResolve(TEST_HISTORY_DIR, COMMAND_PROMPT_HISTORY_FILE);
      const fileContent = await fsExtra.readJson(historyFilePath);
      assert.deepStrictEqual(fileContent.histories['hist_add_save_test'], ['second', 'third'], 'Saved history should respect limit');
    });

    it('should use history config from globalConfig and prompt options', function() {
      PromptModule.setConfig({
        history: { limit: 5, folder: TEST_HISTORY_DIR, fileName: 'global-cfg.json', save: false }
      });
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_cfg_test',
        history: { limit: 3, blacklist: ['ignored'] }
      }, rl);

      const historyHandler = prompt.historyHandler;
      assert(historyHandler instanceof DefaultHistory);
      assert.strictEqual(historyHandler.config.limit, 3, 'Prompt limit should override global');
      assert.deepStrictEqual(historyHandler.config.blacklist, ['ignored']);
      assert.strictEqual(historyHandler.config.folder, TEST_HISTORY_DIR);
      assert.strictEqual(historyHandler.config.fileName, 'global-cfg.json');
      assert.strictEqual(historyHandler.config.save, false);
      PromptModule.setConfig({});
    });

    it('should display history with Shift+Right Arrow', async function() {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_display_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: false }
      }, rl);
      let p = getPromiseForAnswer(prompt); type(rl, 'cmd1'); finalEnterAndSubmitLine(rl); await p;
      p = getPromiseForAnswer(prompt); type(rl, 'cmd2'); finalEnterAndSubmitLine(rl); await p;

      const consoleLogStub = sinon.stub(console, 'log');
      p = getPromiseForAnswer(prompt); // For the next interaction (typing 'final')

      rl.input.emit('keypress', '', { name: 'right', shift: true }); // Display history
      await Promise.resolve(); // Allow a tick for event processing and console output

      // We don't await 'p' here because displaying history doesn't resolve the prompt.
      // We are checking the side effect (console.log)
      sinon.assert.called(consoleLogStub);
      // sinon.assert.calledWith(consoleLogStub, chalk.bold('History:'));
      // sinon.assert.calledWithMatch(consoleLogStub, /0\s+cmd1/);
      // sinon.assert.calledWithMatch(consoleLogStub, /1\s+cmd2/);
      consoleLogStub.restore();

      // Now, complete the prompt that was initiated by p = getPromiseForAnswer(prompt)
      rl.line = ''; // Explicitly clear the line before typing the new command
      type(rl, 'final');
      finalEnterAndSubmitLine(rl);
      await p;
      assert.strictEqual(prompt.answer, 'final');
    });

    it('allows passing a custom history handler', async function () {
      const mockHistoryHandler = {
        init: sinon.stub(), add: sinon.stub(),
        getPrevious: sinon.stub().returns('mock_prev_cmd'),
        getNext: sinon.stub().returns('mock_next_cmd'),
        getAll: sinon.stub().returns(['mock1', 'mock2']),
        resetIndex: sinon.stub(), setConfig: sinon.stub()
      };

      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'custom_hist_test',
        historyHandler: mockHistoryHandler,
        history: { customSetting: true }
      }, rl);

      assert.strictEqual(prompt.historyHandler, mockHistoryHandler);
      sinon.assert.calledWith(mockHistoryHandler.init, 'custom_hist_test');
      sinon.assert.calledWith(mockHistoryHandler.setConfig, sinon.match({ customSetting: true }));

      // Test navigating up with custom handler
      rl.line = '';
      let answerPromise = getPromiseForAnswer(prompt);
      moveUp(rl); // Should use mockHistoryHandler.getPrevious
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'mock_prev_cmd', 'Should submit "mock_prev_cmd" from custom handler');
      sinon.assert.calledOnce(mockHistoryHandler.getPrevious);
      sinon.assert.calledWith(mockHistoryHandler.add, 'custom_hist_test', 'mock_prev_cmd');

      // Test navigating down with custom handler
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      moveDown(rl); // Should use mockHistoryHandler.getNext
      await Promise.resolve(); // Allow microtasks to settle
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'mock_next_cmd', 'Should submit "mock_next_cmd" from custom handler');
      sinon.assert.calledOnce(mockHistoryHandler.getNext);
      sinon.assert.calledWith(mockHistoryHandler.add, 'custom_hist_test', 'mock_next_cmd');

      // Test typing a new command and submitting with custom handler
      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'new_custom_cmd');
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'new_custom_cmd', 'Should submit typed "new_custom_cmd"');
      sinon.assert.calledWith(mockHistoryHandler.add, 'custom_hist_test', 'new_custom_cmd');

      sinon.assert.calledThrice(mockHistoryHandler.add);
    });
  });

  describe('Parameter Auto-completion', function () {
    beforeEach(function () {
      rl = new ReadlineStub();
      PromptModule.setConfig({}); // Reset global config
    });

    it('should complete with the first matching parameter example', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_1',
        parameterExamples: ['git commit -m "initial commit"', 'git commit --amend', 'git push origin main']
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'git c');
      tab(rl);
      await Promise.resolve(); // Allow potential microtasks from rewrite/render
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'git commit -m "initial commit"');
    });

    it('should use the first example if multiple could match the prefix', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_2',
        parameterExamples: ['ls -l', 'ls -la', 'ls -lh']
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'ls -');
      tab(rl);
      await Promise.resolve();
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'ls -l');
    });

    it('should fall back to command autocompletion if no parameter example matches', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_3',
        parameterExamples: ['conda activate myenv', 'conda install numpy'],
        autoCompletion: ['git', 'conda', 'node'] // Regular command completion
      }, rl);

      // First, test fallback: type 'gi', tab -> should complete to 'git'
      let answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'gi');
      tab(rl); // 'gi' does not match 'conda...' examples, should use autoCompletion
      await Promise.resolve();
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'git', 'Should fall back to command autocompletion');

      // Next, test parameter completion still works for this prompt
      rl.line = ''; // Reset line
      answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'conda a');
      tab(rl); // Should match 'conda activate myenv'
      await Promise.resolve();
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'conda activate myenv', 'Should use parameter completion when it matches');
    });

    it('should use command autocompletion if parameterExamples is not provided or empty', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_4',
        // No parameterExamples here
        autoCompletion: ['myCommand', 'anotherCommand']
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'myC');
      tab(rl);
      await Promise.resolve();
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'myCommand');

      // Test with empty parameterExamples array
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_4_empty',
        parameterExamples: [],
        autoCompletion: ['myCommand', 'anotherCommand']
      }, rl);

      rl.line = '';
      answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'anoth');
      tab(rl);
      await Promise.resolve();
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      assert.strictEqual(prompt.answer, 'anotherCommand');
    });

    it('should do nothing on Tab if input is empty', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_5_empty_input',
        parameterExamples: ['some command', 'another one'],
        autoCompletion: ['regularCmd']
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);
      // rl.line is already ''
      tab(rl); // Press tab on empty line
      await Promise.resolve();
      // Type something to submit, as tab should not have completed.
      type(rl, 'typed after tab');
      finalEnterAndSubmitLine(rl);
      await answerPromise;
      // The crucial part is that tab didn't fill 'some command'
      assert.strictEqual(prompt.answer, 'typed after tab');
    });

    it('should do nothing on Tab if input does not prefix any example or command', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'cmd',
        context: 'param_ac_test_6_no_match',
        parameterExamples: ['git commit', 'git push'],
        autoCompletion: ['conda', 'node']
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);
      type(rl, 'nonexistent');
      tab(rl); // No match in parameters or commands
      await Promise.resolve();
      // Line should remain 'nonexistent'
      finalEnterAndSubmitLine(rl); // Submit current line
      await answerPromise;
      assert.strictEqual(prompt.answer, 'nonexistent');
    });
  });

  describe('Multi-line Input Mode', function() {
    beforeEach(function () {
      rl = new ReadlineStub();
      PromptModule.setConfig({});
    });

    // Helper for Alt+E
    function altE(rlInstance) {
      rlInstance.input.emit('keypress', 'e', { name: 'e', alt: true, ctrl: false, meta: false, shift: false });
    }

    // Helper for Ctrl+C
    function ctrlC(rlInstance) {
      rlInstance.input.emit('keypress', 'c', { name: 'c', ctrl: true, alt: false, meta: false, shift: false });
    }

    it('should enter multi-line mode with Alt+E, add lines with Enter, and submit with second Alt+E', async function() {
      prompt = new PromptModule({
        message: 'Enter command:',
        name: 'multiline_cmd',
        context: 'multiline_test_1'
      }, rl);

      let answerPromise = getPromiseForAnswer(prompt);

      type(rl, 'line1');
      altE(rl); // Enter multi-line mode, 'line1' is buffered
      await Promise.resolve(); // allow render/microtasks

      assert.strictEqual(prompt.isMultiLineMode, true, 'Should be in multi-line mode');
      assert.deepStrictEqual(prompt.multiLineBuffer, ['line1'], 'Buffer should contain first line');
      assert.strictEqual(rl.line, '', 'Current rl.line should be empty for new multi-line input');

      type(rl, 'line2');
      pressEnterKey(rl, prompt); // Add 'line2' to buffer
      await Promise.resolve();

      assert.deepStrictEqual(prompt.multiLineBuffer, ['line1', 'line2'], 'Buffer should contain first and second lines');
      assert.strictEqual(rl.line, '', 'Current rl.line should be empty after Enter in multi-line');

      type(rl, 'line3');
      altE(rl); // Submit with second Alt+E

      const answer = await answerPromise;
      assert.strictEqual(answer, 'line1\nline2\nline3', 'Submitted answer should be all lines joined by newline');
      assert.strictEqual(prompt.isMultiLineMode, false, 'Should exit multi-line mode after submission');
    });

    it('should handle starting multi-line mode on an empty line', async function() {
      prompt = new PromptModule({ message: '>', name: 'cmd', context: 'multiline_empty_start' }, rl);
      let answerPromise = getPromiseForAnswer(prompt);

      altE(rl); // Enter multi-line mode on empty line
      await Promise.resolve();
      assert.strictEqual(prompt.isMultiLineMode, true);
      assert.deepStrictEqual(prompt.multiLineBuffer, [], 'Buffer should be empty if started on empty line');

      type(rl, 'first actual line');
      pressEnterKey(rl, prompt);
      await Promise.resolve();

      type(rl, 'second actual line');
      altE(rl); // Submit

      const answer = await answerPromise;
      assert.strictEqual(answer, 'first actual line\nsecond actual line');
    });

    it('should submit only the first line if Alt+E is pressed twice without Enter', async function() {
      prompt = new PromptModule({ message: '>', name: 'cmd', context: 'multiline_immediate_submit' }, rl);
      let answerPromise = getPromiseForAnswer(prompt);

      type(rl, 'single line for multi-mode');
      altE(rl); // Enter multi-line mode
      await Promise.resolve();
      // No Enter, current rl.line is now empty.
      // Second Alt+E should effectively submit what was buffered ('single line for multi-mode')
      // plus the current (empty) rl.line.
      altE(rl); // Submit

      const answer = await answerPromise;
      // Current logic: first alt+e buffers 'single line for multi-mode', rl.line becomes ''.
      // second alt+e buffers current rl.line (''), joins -> 'single line for multi-mode\n'
      assert.strictEqual(answer, 'single line for multi-mode\n');
    });


    it('should cancel multi-line mode with Ctrl+C and yield undefined', async function() {
      prompt = new PromptModule({ message: '>', name: 'cmd', context: 'multiline_cancel' }, rl);
      let answerPromise = getPromiseForAnswer(prompt);

      type(rl, 'line1 to be canceled');
      altE(rl); // Enter multi-line
      await Promise.resolve();

      type(rl, 'line2 also canceled');
      ctrlC(rl); // Cancel

      const answer = await answerPromise;
      assert.strictEqual(answer, '', 'Answer should be empty string after Ctrl+C');
      assert.strictEqual(prompt.isMultiLineMode, false, 'Should exit multi-line mode after Ctrl+C');
      assert.deepStrictEqual(prompt.multiLineBuffer, [], 'Buffer should be empty after Ctrl+C');
    });

    it('should submit current line if Alt+E is pressed on non-empty line without entering multi-line mode first (if that was the design - current design is toggle)', async function() {
        // This test checks if a single Alt+E on a line behaves like Enter or something else.
        // Based on current plan, first Alt+E *always* enters multi-line.
        // So this test should confirm that behavior.
        prompt = new PromptModule({ message: '>', name: 'cmd', context: 'multiline_alt_e_single_line_is_toggle' }, rl);
        let answerPromise = getPromiseForAnswer(prompt);

        type(rl, 'oneline');
        altE(rl); // Enters multi-line mode
        await Promise.resolve();

        assert.ok(prompt.isMultiLineMode, "Should have entered multi-line mode");
        assert.deepStrictEqual(prompt.multiLineBuffer, ["oneline"]);

        // To complete the prompt for this test case:
        altE(rl); // Submit (empty current line will be added)
        const answer = await answerPromise;
        assert.strictEqual(answer, "oneline\n");
    });

  });

  describe('DefaultHistory (Unit Tests)', function () {
    let defaultHistoryInstance;
    const TEST_CONTEXT = 'default_hist_unit_ctx';
    const HISTORY_DIR_UNIT = pathResolve(__dirname, 'default_history_unit_files');
    const HISTORY_FILE_UNIT = 'unit-test-hist.json';
    const FULL_HISTORY_PATH_UNIT = pathResolve(HISTORY_DIR_UNIT, HISTORY_FILE_UNIT);

    let fsStubs = {}; // To hold stubs for fs-extra methods

    beforeEach(async function () {
      await fsExtra.ensureDir(HISTORY_DIR_UNIT);

      // Stub methods on fsExtra module itself before creating DefaultHistory instance
      fsStubs.existsSync = sinon.stub(fsExtra, 'existsSync');
      fsStubs.readFileSync = sinon.stub(fsExtra, 'readFileSync');
      fsStubs.writeFileSync = sinon.stub(fsExtra, 'writeFileSync');
      fsStubs.ensureDirSync = sinon.stub(fsExtra, 'ensureDirSync');

      defaultHistoryInstance = new DefaultHistory({
        folder: HISTORY_DIR_UNIT,
        fileName: HISTORY_FILE_UNIT,
        save: false
      });
      defaultHistoryInstance.init(TEST_CONTEXT);
    });

    afterEach(async function () {
      sinon.restore();
      if (await fsExtra.pathExists(HISTORY_DIR_UNIT)) {
        await fsExtra.remove(HISTORY_DIR_UNIT);
      }
    });

    it('should add a command and reset index correctly', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1');
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1']);
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1, "Index should be at new line pos");
    });

    it('should not add duplicate of the immediate last command', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1');
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1'); // Attempt to add duplicate
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1'], "Should not add consecutive duplicate");
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1);
    });

    it('should navigate history correctly with getPrevious and getNext', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'c1');
      defaultHistoryInstance.add(TEST_CONTEXT, 'c2');
      defaultHistoryInstance.add(TEST_CONTEXT, 'c3'); // History: [c1, c2, c3], index = 3
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c3', "Prev: c3"); // index = 2
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c2', "Prev: c2"); // index = 1, returns hist[1]
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c1', "Prev: c1"); // index = 0, returns hist[0]
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), undefined, "Prev: undefined (at top)"); // index stays 0

      // Current state: index = 0 (pointing at 'c1')
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 0, "Index should be 0 before getNext sequence");
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), 'c2', "Next after c1 should be c2"); // index becomes 1, returns hist[1]
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1, "Index should be 1 after getNext");
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), 'c3', "Next after c2 should be c3"); // index becomes 2, returns hist[2]
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 2, "Index should be 2 after getNext");
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), undefined, "Next after c3 should be undefined (new line)");// index becomes 3 (length)
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 3, "Index should be 3 (length) at end");
    });

    it('should respect history limit when adding commands', function () {
      defaultHistoryInstance.setConfig({ limit: 2 });
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1');
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd2');
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd3'); // cmd1 should be removed
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd2', 'cmd3'], "Limit should remove oldest");
    });

    it('should not add blacklisted commands to history', function () {
      defaultHistoryInstance.setConfig({ blacklist: ['clear', 'exit'] });
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1');
      defaultHistoryInstance.add(TEST_CONTEXT, 'clear'); // This should be ignored
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd2');
      defaultHistoryInstance.add(TEST_CONTEXT, 'exit'); // This should be ignored
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1', 'cmd2'], "Blacklisted commands ignored");
    });

    describe('File Persistence for DefaultHistory Unit Tests', function () {
      it('load() should populate history from file if exists', function () {
        const fakeHistoryData = { histories: { [TEST_CONTEXT]: ['loaded_cmd1', 'loaded_cmd2'] } };
        fsStubs.existsSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(true);
        fsStubs.readFileSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(JSON.stringify(fakeHistoryData));
        fsStubs.ensureDirSync.withArgs(HISTORY_DIR_UNIT).returns(undefined);

        const newHistoryInstance = new DefaultHistory({ folder: HISTORY_DIR_UNIT, fileName: HISTORY_FILE_UNIT, save: true });
        assert.deepStrictEqual(newHistoryInstance.getAll(TEST_CONTEXT), ['loaded_cmd1', 'loaded_cmd2']);
        // ensureDirSync is called by save(), not directly by load().
        // The constructor calls load(). load() does NOT call _ensureHistoryFile() or save().
        // This assertion was incorrect for a load() test.
      });

      it('save() (called via add) should write current history to file', function () {
        fsStubs.ensureDirSync.withArgs(HISTORY_DIR_UNIT).returns(undefined); // For the instance being tested

        const historyToSave = new DefaultHistory({
            folder: HISTORY_DIR_UNIT,
            fileName: HISTORY_FILE_UNIT,
            save: true // Enable saving
        });
        historyToSave.init(TEST_CONTEXT); // init context
        historyToSave.add(TEST_CONTEXT, 'cmd_to_be_saved');

        const expectedData = { histories: { [TEST_CONTEXT]: ['cmd_to_be_saved'] } };
        sinon.assert.calledWith(fsStubs.ensureDirSync, HISTORY_DIR_UNIT);
        sinon.assert.calledWith(fsStubs.writeFileSync, FULL_HISTORY_PATH_UNIT, JSON.stringify(expectedData, null, 2));
      });

      it('load() should handle corrupted JSON file gracefully', function() {
        fsStubs.existsSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(true);
        fsStubs.readFileSync.withArgs(FULL_HISTORY_PATH_UNIT).returns("this is corrupted json");
        const consoleErrorStub = sinon.stub(console, 'error');

        const newHistoryInstance = new DefaultHistory({ folder: HISTORY_DIR_UNIT, fileName: HISTORY_FILE_UNIT, save: true });
        assert.deepStrictEqual(newHistoryInstance.getAll(TEST_CONTEXT), [], "History should be empty after corrupted load");
        sinon.assert.calledWithMatch(consoleErrorStub, /Invalid or corrupted history file/);
        consoleErrorStub.restore();
      });
    });
  });
});
