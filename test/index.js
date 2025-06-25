/* eslint-disable no-unused-vars */

import assert from 'assert'
import { fileURLToPath } from 'url'
import { dirname, join, resolve as pathResolve } from 'path'
import sinon from 'sinon'
import chalk from 'chalk'
import fsExtra from 'fs-extra' // For stubbing and real file operations

// Helper imports (assuming these are correctly located relative to test/index.js)
import ReadlineStub from './helpers/readline.js'
import PromptModule from '../index.js' // Using PromptModule to avoid conflict
import DefaultHistory from '../DefaultHistory.js' // Direct import for instanceof, etc.

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --- Helper Functions for Tests ---
function getPromiseForAnswer(promptInstance) {
  return promptInstance.run()
}

function type(rlInstance, text) {
  text.split('').forEach(function (char) {
    rlInstance.line = rlInstance.line + char
    rlInstance.input.emit('keypress', char)
  })
}

function moveDown(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'down' })
}

function moveUp(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'up' })
}

function enter(rlInstance) {
  // console.log(`[DEBUG] enter called. rlInstance.line = "${rlInstance.line}"`) // DEBUG
  rlInstance.emit('line', rlInstance.line) // Pass the current line as an argument to the event
}

function tab(rlInstance) {
  rlInstance.input.emit('keypress', '', { name: 'tab' })
}
// --- End Helper Functions ---

describe('inquirer-command-prompt', function () {
  let prompt // General prompt instance for some tests
  let rl     // ReadlineStub instance

  // Note: DefaultHistory is imported directly now, no need for dynamic import in before hook here.

  describe('auto-complete', function () {
    let availableCommands

    beforeEach(function () {
      availableCommands = ['foo', 'bar', 'bum']
      rl = new ReadlineStub()
    })

    it('should return the expected word if that is partially typed', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        autoCompletion: availableCommands,
        context: 'autocomplete_test_1'
      }, rl)
      const promise = getPromiseForAnswer(prompt)
      type(rl, 'f')
      tab(rl)
      enter(rl)
      await promise
      assert.strictEqual(rl.line, 'foo')
    })

    it('should return the typed word if tab not pressed', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        context: 'autocomplete_test_2'
      }, rl)
      const promise = getPromiseForAnswer(prompt)
      type(rl, 'hello')
      enter(rl)
      await promise
      assert.strictEqual(rl.line, 'hello')
    })

    it('should return the typed word if tab pressed but no matches', async function () {
      prompt = new PromptModule({
        message: '>',
        name: 'name',
        autoCompletion: availableCommands,
        context: 'autocomplete_test_3'
      }, rl)
      const promise = getPromiseForAnswer(prompt)
      type(rl, 'zu')
      tab(rl)
      enter(rl)
      await promise
      assert.strictEqual(rl.line, 'zu')
    })
  })

  describe('CommandPrompt History (Integration)', function () {
    const TEST_HISTORY_DIR = pathResolve(__dirname, 'test_history_files')
    const COMMAND_PROMPT_HISTORY_FILE = 'cmd-prompt-test-hist.json'

    beforeEach(async function () {
      rl = new ReadlineStub()
      PromptModule.setConfig({}) // Reset global config
      await fsExtra.ensureDir(TEST_HISTORY_DIR)
      const historyFilePath = pathResolve(TEST_HISTORY_DIR, COMMAND_PROMPT_HISTORY_FILE)
      if (await fsExtra.pathExists(historyFilePath)) {
        await fsExtra.remove(historyFilePath)
      }
    })

    afterEach(async function () {
      sinon.restore()
      if (await fsExtra.pathExists(TEST_HISTORY_DIR)) {
        await fsExtra.remove(TEST_HISTORY_DIR)
      }
    })

    it('should navigate command history with up and down arrows', async function () {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_nav_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: true }
      }, rl)

      // Prompt 1
      let answerPromise = getPromiseForAnswer(prompt); type(rl, 'cmd1'); enter(rl); await answerPromise
      assert.strictEqual(prompt.answer, 'cmd1', 'Prompt 1 answer should be cmd1')

      // Prompt 2
      rl.line = '' // Reset line for prompt 2
      answerPromise = getPromiseForAnswer(prompt); type(rl, 'cmd2'); enter(rl); await answerPromise
      assert.strictEqual(prompt.answer, 'cmd2', 'Prompt 2 answer should be cmd2')

      // Prompt 3 (for navigation and final submission)
      rl.line = '' // Reset line for prompt 3
      answerPromise = getPromiseForAnswer(prompt)

      moveUp(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #1a] After moveUp, rl.line = "${rl.line}" for "cmd2" check`)
      assert.strictEqual(rl.line, 'cmd2', 'Nav up to cmd2')

      moveUp(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #1b] After moveUp, rl.line = "${rl.line}" for "cmd1" check`)
      assert.strictEqual(rl.line, 'cmd1', 'Nav up to cmd1')

      moveUp(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #1c] After moveUp, rl.line = "${rl.line}" for "cmd1" (stay) check`)
      assert.strictEqual(rl.line, 'cmd1', 'Stay at cmd1 (top)')

      moveDown(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #1d] After moveDown, rl.line = "${rl.line}" for "cmd2" check`)
      assert.strictEqual(rl.line, 'cmd2', 'Nav down to cmd2')

      moveDown(rl); await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(rl.line, '', 'Nav down to new empty line') // HistoryHandler.getNext returns undefined, onKeypress rewrites ''

      moveDown(rl); await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(rl.line, '', 'Stay at empty line')

      type(rl, 'cmd3') // Type the final command
      enter(rl) // Submit it
      await answerPromise // Wait for this prompt to resolve
      assert.strictEqual(prompt.answer, 'cmd3', 'Final command submitted should be cmd3')
    })

    it('should add submitted commands to history and save them (respecting limit)', async function () {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_add_save_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: true, limit: 2 }
      }, rl)

      const historyHandler = prompt.historyHandler
      assert(historyHandler instanceof DefaultHistory, 'Should use DefaultHistory instance')

      // Command 1
      rl.line = ''
      let p = getPromiseForAnswer(prompt); type(rl, 'first'); enter(rl); await p
      assert.strictEqual(prompt.answer, 'first')
      // After 'first' is added, history: ['first']

      // Command 2
      rl.line = ''
      p = getPromiseForAnswer(prompt); type(rl, 'second'); enter(rl); await p
      assert.strictEqual(prompt.answer, 'second')
      // After 'second' is added, history: ['first', 'second']

      // Command 3
      rl.line = ''
      p = getPromiseForAnswer(prompt); type(rl, 'third'); enter(rl); await p
      assert.strictEqual(prompt.answer, 'third')
      // After 'third' is added, history (limit 2): ['second', 'third']

      assert.deepStrictEqual(historyHandler.getAll('hist_add_save_test'), ['second', 'third'], 'History should respect limit')

      const historyFilePath = pathResolve(TEST_HISTORY_DIR, COMMAND_PROMPT_HISTORY_FILE)
      const fileContent = await fsExtra.readJson(historyFilePath)
      assert.deepStrictEqual(fileContent.histories['hist_add_save_test'], ['second', 'third'], 'Saved history should respect limit')
    })

    it('should use history config from globalConfig and prompt options', function() {
      PromptModule.setConfig({
        history: { limit: 5, folder: TEST_HISTORY_DIR, fileName: 'global-cfg.json', save: false }
      })
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_cfg_test',
        history: { limit: 3, blacklist: ['ignored'] }
      }, rl)

      const historyHandler = prompt.historyHandler
      assert(historyHandler instanceof DefaultHistory)
      assert.strictEqual(historyHandler.config.limit, 3, 'Prompt limit should override global')
      assert.deepStrictEqual(historyHandler.config.blacklist, ['ignored'])
      assert.strictEqual(historyHandler.config.folder, TEST_HISTORY_DIR)
      assert.strictEqual(historyHandler.config.fileName, 'global-cfg.json')
      assert.strictEqual(historyHandler.config.save, false)
      PromptModule.setConfig({})
    })

    it('should display history with Shift+Right Arrow', async function() {
      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'hist_display_test',
        history: { folder: TEST_HISTORY_DIR, fileName: COMMAND_PROMPT_HISTORY_FILE, save: false }
      }, rl)
      let p = getPromiseForAnswer(prompt); type(rl, 'cmd1'); enter(rl); await p
      rl.line = '' // Clear rl.line before typing the next command
      p = getPromiseForAnswer(prompt); type(rl, 'cmd2'); enter(rl); await p

      const consoleLogStub = sinon.stub(console, 'log')
      p = getPromiseForAnswer(prompt)

      rl.input.emit('keypress', '', { name: 'right', shift: true })
      await new Promise(resolve => setImmediate(resolve)); // Wait for async operations in onKeypress

      sinon.assert.called(consoleLogStub) // Check if called at all first
      // If the above passes, then these more specific checks can be enabled:
      sinon.assert.calledWithMatch(consoleLogStub, /History:/) // Less strict check for "History:" title
      sinon.assert.calledWithMatch(consoleLogStub, / {2}0\s+cmd1/) // Two spaces for index 0 (limit 100)
      sinon.assert.calledWithMatch(consoleLogStub, / {2}1\s+cmd2/) // Two spaces for index 1 (limit 100)

      consoleLogStub.restore()
      type(rl, 'final'); enter(rl); await p
    })

    it('allows passing a custom history handler', async function () {
      const mockHistoryHandler = {
        init: sinon.stub(), add: sinon.stub(),
        getPrevious: sinon.stub().returns('mock_prev_cmd'),
        getNext: sinon.stub().returns('mock_next_cmd'),
        getAll: sinon.stub().returns(['mock1', 'mock2']),
        resetIndex: sinon.stub(), setConfig: sinon.stub()
      }

      prompt = new PromptModule({
        message: '>', name: 'cmd', context: 'custom_hist_test',
        historyHandler: mockHistoryHandler,
        history: { customSetting: true }
      }, rl)

      assert.strictEqual(prompt.historyHandler, mockHistoryHandler)
      sinon.assert.calledWith(mockHistoryHandler.init, 'custom_hist_test')
      sinon.assert.calledWith(mockHistoryHandler.setConfig, sinon.match({ customSetting: true }))

      let p = getPromiseForAnswer(prompt)
      moveUp(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #3a] After moveUp, rl.line = "${rl.line}" for "mock_prev_cmd" check`)
      assert.strictEqual(rl.line, 'mock_prev_cmd')
      sinon.assert.calledOnce(mockHistoryHandler.getPrevious)

      moveDown(rl); await new Promise(resolve => setImmediate(resolve));
      // console.log(`[TEST DEBUG #3b] After moveDown, rl.line = "${rl.line}" for "mock_next_cmd" check`)
      assert.strictEqual(rl.line, 'mock_next_cmd')
      sinon.assert.calledOnce(mockHistoryHandler.getNext)
      type(rl, 'new_custom_cmd'); enter(rl); await p
      sinon.assert.calledWith(mockHistoryHandler.add, 'custom_hist_test', 'mock_next_cmdnew_custom_cmd')
    })
  })

  describe('DefaultHistory (Unit Tests)', function () {
    let defaultHistoryInstance
    const TEST_CONTEXT = 'default_hist_unit_ctx'
    const HISTORY_DIR_UNIT = pathResolve(__dirname, 'default_history_unit_files')
    const HISTORY_FILE_UNIT = 'unit-test-hist.json'
    const FULL_HISTORY_PATH_UNIT = pathResolve(HISTORY_DIR_UNIT, HISTORY_FILE_UNIT)

    let fsStubs = {} // To hold stubs for fs-extra methods

    beforeEach(async function () {
      await fsExtra.ensureDir(HISTORY_DIR_UNIT)

      // Stub methods on fsExtra module itself before creating DefaultHistory instance
      fsStubs.existsSync = sinon.stub(fsExtra, 'existsSync')
      fsStubs.readFileSync = sinon.stub(fsExtra, 'readFileSync')
      fsStubs.writeFileSync = sinon.stub(fsExtra, 'writeFileSync')
      fsStubs.ensureDirSync = sinon.stub(fsExtra, 'ensureDirSync')

      defaultHistoryInstance = new DefaultHistory({
        folder: HISTORY_DIR_UNIT,
        fileName: HISTORY_FILE_UNIT,
        save: false
      })
      defaultHistoryInstance.init(TEST_CONTEXT)
    })

    afterEach(async function () {
      sinon.restore()
      if (await fsExtra.pathExists(HISTORY_DIR_UNIT)) {
        await fsExtra.remove(HISTORY_DIR_UNIT)
      }
    })

    it('should add a command and reset index correctly', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1')
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1'])
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1, 'Index should be at new line pos')
    })

    it('should not add duplicate of the immediate last command', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1')
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1') // Attempt to add duplicate
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1'], 'Should not add consecutive duplicate')
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1)
    })

    it('should navigate history correctly with getPrevious and getNext', function () {
      defaultHistoryInstance.add(TEST_CONTEXT, 'c1')
      defaultHistoryInstance.add(TEST_CONTEXT, 'c2')
      defaultHistoryInstance.add(TEST_CONTEXT, 'c3') // History: [c1, c2, c3], index = 3
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c3', 'Prev: c3') // index = 2
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c2', 'Prev: c2') // index = 1, returns hist[1]
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), 'c1', 'Prev: c1') // index = 0, returns hist[0]
      assert.strictEqual(defaultHistoryInstance.getPrevious(TEST_CONTEXT), undefined, 'Prev: undefined (at top)') // index stays 0

      // Current state: index = 0 (pointing at 'c1')
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 0, 'Index should be 0 before getNext sequence')
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), 'c2', 'Next after c1 should be c2') // index becomes 1, returns hist[1]
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 1, 'Index should be 1 after getNext')
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), 'c3', 'Next after c2 should be c3') // index becomes 2, returns hist[2]
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 2, 'Index should be 2 after getNext')
      assert.strictEqual(defaultHistoryInstance.getNext(TEST_CONTEXT), undefined, 'Next after c3 should be undefined (new line)')// index becomes 3 (length)
      assert.strictEqual(defaultHistoryInstance.historyIndexes[TEST_CONTEXT], 3, 'Index should be 3 (length) at end')
    })

    it('should respect history limit when adding commands', function () {
      defaultHistoryInstance.setConfig({ limit: 2 })
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1')
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd2')
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd3') // cmd1 should be removed
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd2', 'cmd3'], 'Limit should remove oldest')
    })

    it('should not add blacklisted commands to history', function () {
      defaultHistoryInstance.setConfig({ blacklist: ['clear', 'exit'] })
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd1')
      defaultHistoryInstance.add(TEST_CONTEXT, 'clear') // This should be ignored
      defaultHistoryInstance.add(TEST_CONTEXT, 'cmd2')
      defaultHistoryInstance.add(TEST_CONTEXT, 'exit') // This should be ignored
      assert.deepStrictEqual(defaultHistoryInstance.getAll(TEST_CONTEXT), ['cmd1', 'cmd2'], 'Blacklisted commands ignored')
    })

    describe('File Persistence for DefaultHistory Unit Tests', function () {
      it('load() should populate history from file if exists', function () {
        const fakeHistoryData = { histories: { [TEST_CONTEXT]: ['loaded_cmd1', 'loaded_cmd2'] } }
        fsStubs.existsSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(true)
        fsStubs.readFileSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(JSON.stringify(fakeHistoryData))
        fsStubs.ensureDirSync.withArgs(HISTORY_DIR_UNIT).returns(undefined)

        const newHistoryInstance = new DefaultHistory({ folder: HISTORY_DIR_UNIT, fileName: HISTORY_FILE_UNIT, save: true })
        assert.deepStrictEqual(newHistoryInstance.getAll(TEST_CONTEXT), ['loaded_cmd1', 'loaded_cmd2'])
        // ensureDirSync is called by save(), not directly by load().
        // The constructor calls load(). load() does NOT call _ensureHistoryFile() or save().
        // This assertion was incorrect for a load() test.
      })

      it('save() (called via add) should write current history to file', function () {
        fsStubs.ensureDirSync.withArgs(HISTORY_DIR_UNIT).returns(undefined) // For the instance being tested

        const historyToSave = new DefaultHistory({
            folder: HISTORY_DIR_UNIT,
            fileName: HISTORY_FILE_UNIT,
            save: true // Enable saving
        })
        historyToSave.init(TEST_CONTEXT) // init context
        historyToSave.add(TEST_CONTEXT, 'cmd_to_be_saved')

        const expectedData = { histories: { [TEST_CONTEXT]: ['cmd_to_be_saved'] } }
        sinon.assert.calledWith(fsStubs.ensureDirSync, HISTORY_DIR_UNIT)
        sinon.assert.calledWith(fsStubs.writeFileSync, FULL_HISTORY_PATH_UNIT, JSON.stringify(expectedData, null, 2))
      })

      it('load() should handle corrupted JSON file gracefully', function() {
        fsStubs.existsSync.withArgs(FULL_HISTORY_PATH_UNIT).returns(true)
        fsStubs.readFileSync.withArgs(FULL_HISTORY_PATH_UNIT).returns('this is corrupted json')
        const consoleErrorStub = sinon.stub(console, 'error')

        const newHistoryInstance = new DefaultHistory({ folder: HISTORY_DIR_UNIT, fileName: HISTORY_FILE_UNIT, save: true })
        assert.deepStrictEqual(newHistoryInstance.getAll(TEST_CONTEXT), [], 'History should be empty after corrupted load')
        sinon.assert.calledWithMatch(consoleErrorStub, /Invalid or corrupted history file/)
        consoleErrorStub.restore()
      })
    })
  })
})
