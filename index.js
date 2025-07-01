import chalk from 'chalk';
// fs and path are not directly used in CommandPrompt anymore; DefaultHistory handles its own imports.
// import fs from 'fs-extra';
// import path from 'path';
import _ from 'lodash';
import InputPrompt from 'inquirer/lib/prompts/input.js';
import DefaultHistory from './DefaultHistory.js';

// autoCompleters will store autocompletion functions keyed by context.
const autoCompleters = {};

let globalConfig // This will be used to configure the history handler
const ELLIPSIS = '…'
// let rl; // Remove global rl variable

class CommandPrompt extends InputPrompt {
  constructor(...args) {
    super(...args);

    const historyOptions = this.opt.history || {};
    const globalHistoryConfig = (globalConfig && globalConfig.history) || {};

    // Check for a user-provided custom history handler that meets the interface
    const hasRequiredHistoryMethods = this.opt.historyHandler &&
      typeof this.opt.historyHandler.init === 'function' &&
      typeof this.opt.historyHandler.add === 'function' &&
      typeof this.opt.historyHandler.getPrevious === 'function' &&
      typeof this.opt.historyHandler.getNext === 'function' &&
      typeof this.opt.historyHandler.getAll === 'function' &&
      typeof this.opt.historyHandler.resetIndex === 'function';

    if (hasRequiredHistoryMethods) {
      this.historyHandler = this.opt.historyHandler;
      // Configure the custom handler if it supports setConfig
      if (typeof this.historyHandler.setConfig === 'function') {
        // Merge global history config with prompt-specific history config
        const finalHistoryConfig = { ...globalHistoryConfig, ...historyOptions };
        this.historyHandler.setConfig(finalHistoryConfig);
      }
    } else {
      // Initialize default history handler if no valid custom one is provided
      // Merge global history config with prompt-specific history config
      const defaultHistoryConfig = { ...globalHistoryConfig, ...historyOptions };
      this.historyHandler = new DefaultHistory(defaultHistoryConfig);
    }

    this.context = this.opt.context || '_default';
    this.historyHandler.init(this.context); // Initialize for the current context

    // Store parameter examples if provided
    this.parameterExamples = this.opt.parameterExamples || [];
  }

  // Static utility methods previously part of CommandPrompt history logic,
  // now either removed or kept if generally useful.

  static formatIndex(i, limit = 100) {
    let len = (limit || 100).toString().length;
  return ' '.repeat(len - `${i}`.length) + i
 }

 static short(l, m) {
  if (l) {
   l = l.replace(/ $/, '')
   for (let i = 0; i < m.length; i++) {
    if (m[i] === l) {
     m.splice(i, 1)
     i--
    } else {
     if (m[i][l.length] === ' ') {
      m[i] = m[i].replace(RegExp(l + ' '), '')
     } else {
      m[i] = m[i].replace(RegExp(l.replace(/ [^ ]+$/, '') + ' '), '')
     }
    }
   }
  }
  return m
 }

 static isFunc(func) {
  return typeof func === 'function'
 }

 static isAsyncFunc(func) {
  return CommandPrompt.isFunc(func) && func.constructor.name === 'AsyncFunction';
 }

 static formatList(elems, maxSize = 32, ellipsized, ellipsis) {
  const cols = process.stdout.columns
  let ratio = Math.floor((cols - 1) / maxSize)
  let remainder = (cols - 1) % maxSize
  maxSize += Math.floor(remainder / ratio)
  let max = 0
  for (let elem of elems) {
   max = Math.max(max, elem.length + 4)
  }
  if (ellipsized && max > maxSize) {
   max = maxSize
  }
  let columns = (cols / max) | 0
  let str = ''
  let c = 1
  for (let elem of elems) {
    str += CommandPrompt.setSpaces(elem, max, ellipsized, ellipsis);
   if (c === columns) {
    str += ' '.repeat(cols - max * columns)
    c = 1
   } else {
    c++
   }
  }
  return str
 }

 static setSpaces(str, len, ellipsized, ellipsis) {
  if (ellipsized && str.length > len - 1) {
      str = CommandPrompt.ellipsize(str, len - 1, ellipsis);
  }
  return str + ' '.repeat(len - CommandPrompt.decolorize(str).length);
 }

 static ellipsize(str, len, ellipsis = ELLIPSIS) {
  if (str.length > len) {
      let l = CommandPrompt.decolorize(ellipsis).length + 1;
   return str.substring(0, len - l) + ellipsis
  }
 }

 static decolorize(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
 }

 static setConfig(config) {
  if (typeof config === 'object') {
   globalConfig = config
  }
 }

 static getRl() {
  return rl;
 }

 // Remove unused static getHistory and getHistories methods as they relied on old global state
 // static getHistory(context) { ... }
 // static getHistories(useLimit) { ... }

 async initAutoCompletion(context, autoCompletion) { // context param is fine, it's this.context passed from onKeypress
  if (!autoCompleters[context]) {
      if (CommandPrompt.isAsyncFunc(autoCompletion)) { // Use CommandPrompt for static check
        autoCompleters[context] = async l => this.asyncAutoCompleter(l, autoCompletion);
      } else if (autoCompletion) {
        autoCompleters[context] = l => this.autoCompleter(l, autoCompletion);
   } else {
    autoCompleters[context] = () => []
   }
  }
 }

 async onKeypress(e) {

  if (this.opt.onBeforeKeyPress) {
   this.opt.onBeforeKeyPress(e)
  }

  const rewrite = line => {
   if (this.opt.onBeforeRewrite) {
    line = this.opt.onBeforeRewrite(line)
   }
   this.rl.line = line
   console.log(`[DEBUG CommandPrompt.rewrite] this.rl.line set to: "${this.rl.line}"`); // DEBUG
   this.rl.write(null, {ctrl: true, name: 'e'})
  }

    // this.context is initialized in the constructor.
    // Ensure history is initialized for the context (also done in constructor, but harmless here).
    this.historyHandler.init(this.context);

    // Ensure autocompleter is initialized for the current context.
    // Pass this.context, which is correctly set.
    await this.initAutoCompletion(this.context, this.opt.autoCompletion);

    /** go up commands history */
    if (e.key.name === 'up') {
      const previousCommand = this.historyHandler.getPrevious(this.context);
      if (previousCommand !== undefined) {
        rewrite(previousCommand);
        this.rl.line = previousCommand; // Explicitly re-set after render, for test stability
      }
    }
    /** go down commands history */
    else if (e.key.name === 'down') {
      const nextCommand = this.historyHandler.getNext(this.context);
      const lineValue = nextCommand !== undefined ? nextCommand : '';
      rewrite(lineValue);
      this.rl.line = lineValue; // Explicitly re-set after render
    }
    /** search for command at an autoComplete option */
    else if (e.key.name === 'tab') {
      const currentLine = this.rl.line;

      // 1. Try parameter autocompletion first
      if (this.parameterExamples && this.parameterExamples.length > 0) {
        // Only attempt parameter completion if currentLine is not empty
        if (currentLine.length > 0) {
          for (const example of this.parameterExamples) {
            if (example.startsWith(currentLine)) {
              rewrite(example);
              this.render(); // Explicit render for immediate feedback after parameter completion
              return;
            }
          }
        }
      }

      // 2. If no parameter completion, proceed to existing command autocompletion
      let lineForCommandAutocomplete = currentLine.replace(/^ +/, '').replace(/\t/, '').replace(/ +/g, ' ');

      // Only attempt command autocompletion if there's content in the line (after cleaning)
      if (lineForCommandAutocomplete.length > 0) {
        try {
          var ac;
          // initAutoCompletion ensures autoCompleters[this.context] is a function.
          if (CommandPrompt.isAsyncFunc(this.opt.autoCompletion)) { // Check original opt type
            ac = await autoCompleters[this.context](lineForCommandAutocomplete);
          } else if (typeof this.opt.autoCompletion === 'function' || Array.isArray(this.opt.autoCompletion)) {
            // autoCompleters[this.context] would have been initialized by initAutoCompletion
            // to handle arrays or sync functions.
            if (typeof autoCompleters[this.context] === 'function') {
                 ac = autoCompleters[this.context](lineForCommandAutocomplete);
            } else {
                 // This case should ideally not be reached if initAutoCompletion works correctly
                 // and this.opt.autoCompletion was a func/array.
                 ac = {};
            }
          } else {
            // No autoCompletion configured or it's of an unexpected type
            ac = {};
          }

          if (ac.match) {
            rewrite(ac.match);
          } else if (ac.matches && ac.matches.length > 0) {
            console.log();
            if (typeof process.stdout.cursorTo === 'function') {
              process.stdout.cursorTo(0);
            }
            console.log(this.opt.autocompletePrompt || chalk.red('>> ') + chalk.grey('Available commands:'));
            console.log(CommandPrompt.formatList(
              this.opt.short
                ? ( typeof this.opt.short === 'function'
                    ? this.opt.short(lineForCommandAutocomplete, ac.matches)
                    : CommandPrompt.short(lineForCommandAutocomplete, ac.matches) )
                : ac.matches,
              this.opt.maxSize, this.opt.ellipsize, this.opt.ellipsis
            ));
            rewrite(lineForCommandAutocomplete);
          }
          // If no match or empty matches, currentLine remains.
        } catch (err) {
          console.error('Error during tab completion:', err);
          rewrite(currentLine); // Rewrite the original line on error
        }
      }
      // If both parameter and command autocompletion are skipped (e.g. empty line for both checks),
      // rl.line remains as it was. The render() at the end of onKeypress will refresh.
    }
    /** Display history or recall specific history entry */
    else if (e.key.name === 'right' && e.key.shift) {
      if (e.key.ctrl) {
        // History recall by number if current line is a number
        const lineAsIndex = parseInt(this.rl.line, 10);
        if (!isNaN(lineAsIndex)) {
          const historyEntries = this.historyHandler.getAll(this.context);
          if (lineAsIndex >= 0 && lineAsIndex < historyEntries.length) {
            rewrite(historyEntries[lineAsIndex]);
          } else {
            rewrite(''); // Index out of bounds or invalid
          }
        } else {
          rewrite(''); // Current line is not a number
        }
      } else {
        // Display all history entries
        const historyEntries = this.historyHandler.getAll(this.context);
        const historyConfig = this.historyHandler.config || {};
        const historyLimit = historyConfig.limit !== undefined ? historyConfig.limit : 100;

        console.log(); // Newline before history list
        console.log(chalk.bold('History:'));
        if (historyEntries.length === 0) {
          console.log(chalk.grey('  (No history)'));
        } else {
          for (let i = 0; i < historyEntries.length; i++) {
            // Use CommandPrompt.formatIndex for consistent formatting.
            console.log(`${chalk.grey(CommandPrompt.formatIndex(i, historyLimit))}  ${historyEntries[i]}`);
          }
        }
        rewrite(''); // Clear the current line after displaying history
      }
    }
    /** Execute onCtrlEnd if defined */
    else if (e.key.name === 'end' && e.key.ctrl) {
      if (globalConfig && typeof globalConfig.onCtrlEnd === 'function') {
        rewrite(globalConfig.onCtrlEnd(this.rl.line));
      } else {
        rewrite('');
      }
    }
    this.render();
    console.log(`[DEBUG CommandPrompt.onKeypress END] this.rl.line: "${this.rl.line}"`); // DEBUG
  }

  async asyncAutoCompleter(line, cmds) {
  cmds = await cmds(line)
  return this.autoCompleterFormatter(line, cmds)
 }

 autoCompleter(line, cmds) {
  if (typeof cmds === 'function') {
   cmds = cmds(line)
  }
  return this.autoCompleterFormatter(line, cmds)
 }

 autoCompleterFormatter(line, cmds) {
  let max = 0

  // first element in cmds can be an object with special instructions
  let options = {
   filter: str => str
  }
  if (typeof cmds[0] === 'object') {
   const f = cmds[0].filter
   if (typeof f === 'function') {
    options.filter = f
   }
   cmds = cmds.slice(1)
  }

  cmds = cmds.reduce((sum, el) => {
   let sanitizedLine = line.replace(/[\\\.\+\*\?\^\$\[\]\(\)\{\}\/\'\#\:\!\=\|]/ig, '\\$&')
   RegExp(`^${sanitizedLine}`).test(el) && sum.push(el) && (max = Math.max(max, el.length))
   return sum
  }, [])
  if (cmds.length > 1) {
   let commonStr = ''
   LOOP: for (let i = line.length; i < max; i++) {
    let c = null
    for (let l of cmds) {
     if (!l[i]) {
      break LOOP
     } else if (!c) {
      c = l[i]
     } else if (c !== l[i]) {
      break LOOP
     }
    }
    commonStr += c
   }
   if (commonStr) {
    return {match: options.filter(line + commonStr)}
   } else {
    return {matches: cmds}
   }
  } else if (cmds.length === 1) {
   return {match: options.filter(cmds[0])}
  } else {
   return {match: options.filter(line)}
  }
 }

  run() {
    return new Promise( (resolve) => { // Using arrow function to preserve `this`
      this._run( (value) => { // Using arrow function to preserve `this`
        // Use this.historyHandler to add command, with this.context
        this.historyHandler.add(this.context, value);
        // No need to manage historyIndexes here, DefaultHistory's add() handles it.
        resolve(value);
      });
    }); // No need for .bind(this) if using arrow functions
  }

  render(error) {
    console.log(`[DEBUG CommandPrompt.render START] this.rl.line: "${this.rl.line}"`); // DEBUG
  // rl = this.rl; // Removed assignment to global `rl`. `this.rl` is used directly below.
  let bottomContent = ''
  let appendContent = ''
  let message = this.getQuestion()
  let transformer = this.opt.transformer
  let isFinal = this.status === 'answered'
  if (isFinal) {
   appendContent = this.answer
  } else {
   appendContent = this.rl.line
  }
  if (transformer) {
   message += transformer(appendContent, this.answers, {isFinal})
  } else {
   message += isFinal && !this.opt.noColorOnAnswered ? chalk[this.opt.colorOnAnswered || 'cyan'](appendContent) : appendContent
  }
  if (error) {
   bottomContent = chalk.red('>> ') + error
  }
  this.screen.render(message, bottomContent)
 }

 close() {
  if (typeof this.opt.onClose === 'function') {
   this.opt.onClose()
  }
 }

}


export default CommandPrompt