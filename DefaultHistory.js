import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'

const DEFAULT_HISTORY_FILE_NAME = 'inquirer-command-prompt-history.json'

class DefaultHistory {
  constructor(config = {}) {
    this.histories = {} // Maps context to array of commands
    this.historyIndexes = {} // Maps context to current index in its history array
    this.config = {
      save: true,
      folder: '.',
      limit: 100,
      blacklist: [],
      fileName: DEFAULT_HISTORY_FILE_NAME,
      ...config, // User-provided config overrides defaults
    }
    this._historyFile = null

    if (this.config.save) {
      this._historyFile = path.join(this.config.folder, this.config.fileName)
      this.load() // Load history on initialization if saving is enabled
    }
  }

  setConfig(config) {
    if (typeof config === 'object') {
      this.config = { ...this.config, ...config }
      // Re-evaluate history file path if folder or fileName changed
      if (config.folder || config.fileName) {
        this._historyFile = path.join(this.config.folder, this.config.fileName)
      }
    }
  }

  _ensureHistoryFile() {
    if (this.config.save && this._historyFile) {
      try {
        fs.ensureDirSync(path.dirname(this._historyFile))
        return true
      } catch (e) {
        console.error('DefaultHistory ERROR: Could not create history directory.', e)
        // Optionally disable saving for this session if directory cannot be created
        // this.config.save = false;
        return false
      }
    }
    return true // Or false if save is not enabled, depending on desired semantics
  }

  init(context) {
    if (!this.histories[context]) {
      this.histories[context] = []
      this.historyIndexes[context] = 0
    }
  }

  add(context, value) {
    this.init(context) // Ensure context is initialized

    if (this.config.blacklist && this.config.blacklist.includes(value)) {
      return
    }

    // Avoid adding duplicate of the last command
    if (this.histories[context][this.histories[context].length - 1] !== value) {
      this.histories[context].push(value)
      // If history limit is exceeded, remove the oldest entry
      if (this.config.limit && this.histories[context].length > this.config.limit) {
        this.histories[context].shift()
      }
    }
    // Always reset index to the end (pointing to the new empty line) after adding
    this.historyIndexes[context] = this.histories[context].length

    if (this.config.save) {
      this.save()
    }
  }

  getPrevious(context) {
    this.init(context) // Ensure context is initialized
    if (this.historyIndexes[context] > 0) {
      this.historyIndexes[context]--
      return this.histories[context][this.historyIndexes[context]]
    }
    return undefined // At the beginning or no history
  }

  getNext(context) {
    this.init(context) // Ensure context is initialized
    if (this.historyIndexes[context] < this.histories[context].length - 1) {
      this.historyIndexes[context]++
      return this.histories[context][this.historyIndexes[context]]
    } else if (this.historyIndexes[context] === this.histories[context].length - 1) {
      // If at the last item, increment index to point "after" it (for new input)
      this.historyIndexes[context]++
      return undefined // Indicates user should see an empty line
    }
    return undefined // Already at the "new input" line or no history
  }

  resetIndex(context) {
    this.init(context)
    this.historyIndexes[context] = this.histories[context].length
  }

  getAll(context) {
    this.init(context)
    return [...this.histories[context]] // Return a copy
  }

  _getLimitedHistories() {
    const limitedHistories = _.cloneDeep(this.histories) // Use cloneDeep for nested arrays
    const limit = this.config.limit
    if (limit) {
      for (const c in limitedHistories) {
        const len = limitedHistories[c].length
        if (len > limit) {
          limitedHistories[c] = limitedHistories[c].slice(len - limit)
        }
      }
    }
    return limitedHistories
  }

  save() {
    if (!this.config.save || !this._historyFile) {
      return
    }
    // _ensureHistoryFile now returns false if it fails, and logs the error.
    if (!this._ensureHistoryFile()) {
      // If directory creation failed, optionally disable future save attempts for this session
      // or simply return to prevent trying to write.
      // console.error('DefaultHistory: Skipping save due to directory issue.');
      // this.config.save = false; // Example: disable future saves
      return
    }
    const historiesToSave = this._getLimitedHistories()
    try {
      fs.writeFileSync(
        this._historyFile,
        JSON.stringify({ histories: historiesToSave }, null, 2)
      )
    } catch (e) {
      console.error('DefaultHistory ERROR: Could not save history file.', e)
    }
  }

  load() {
    if (!this.config.save || !this._historyFile || !fs.existsSync(this._historyFile)) {
      return
    }
    try {
      const fileContents = fs.readFileSync(this._historyFile)
      const previousData = JSON.parse(fileContents)
      if (previousData && previousData.histories) {
        this.histories = previousData.histories
        for (const c in this.histories) {
          // Ensure indexes are correctly set after loading
          this.historyIndexes[c] = this.histories[c].length
        }
      }
    } catch (e) {
      console.error('DefaultHistory ERROR: Invalid or corrupted history file.', e)
      try {
        const corruptedFilePath = this._historyFile + '.corrupted-' + Date.now()
        fs.renameSync(this._historyFile, corruptedFilePath)
        console.log(`DefaultHistory: Corrupted history file backed up to ${corruptedFilePath}`)
      } catch (backupError) {
        console.error('DefaultHistory ERROR: Could not back up corrupted history file.', backupError)
      }
      this.histories = {} // Start with empty history if file is corrupt
      this.historyIndexes = {}
    }
  }
}

export default DefaultHistory
