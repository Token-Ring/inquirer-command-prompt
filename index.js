import chalk from 'chalk';
import { createPrompt, useState, useKeypress, usePrefix } from '@inquirer/core';
import DefaultHistory from './DefaultHistory.js';

// autoCompleters will store autocompletion functions keyed by context.
const autoCompleters = {};

const ELLIPSIS = '…';

// Utility functions
const isFunc = (func) => typeof func === 'function';
const isAsyncFunc = (func) => isFunc(func) && func.constructor.name === 'AsyncFunction';
const decolorize = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

const formatIndex = (i, limit = 100) => {
  let len = (limit || 100).toString().length;
  return ' '.repeat(len - `${i}`.length) + i;
};

const ellipsize = (str, len, ellipsis = ELLIPSIS) => {
  if (str.length > len) {
    let l = decolorize(ellipsis).length + 1;
    return str.substring(0, len - l) + ellipsis;
  }
  return str;
};

const setSpaces = (str, len, ellipsized, ellipsis) => {
  if (ellipsized && str.length > len - 1) {
    str = ellipsize(str, len - 1, ellipsis);
  }
  return str + ' '.repeat(len - decolorize(str).length);
};

const formatList = (elems, maxSize = 32, ellipsized, ellipsis) => {
  const cols = process.stdout.columns;
  let ratio = Math.floor((cols - 1) / maxSize);
  let remainder = (cols - 1) % maxSize;
  maxSize += Math.floor(remainder / ratio);
  let max = 0;
  for (let elem of elems) {
    max = Math.max(max, elem.length + 4);
  }
  if (ellipsized && max > maxSize) {
    max = maxSize;
  }
  let columns = (cols / max) | 0;
  let str = '';
  let c = 1;
  for (let elem of elems) {
    str += setSpaces(elem, max, ellipsized, ellipsis);
    if (c === columns) {
      str += ' '.repeat(cols - max * columns);
      c = 1;
    } else {
      c++;
    }
  }
  return str;
};

const short = (l, m) => {
  if (l) {
    l = l.replace(/ $/, '');
    for (let i = 0; i < m.length; i++) {
      if (m[i] === l) {
        m.splice(i, 1);
        i--;
      } else {
        if (m[i][l.length] === ' ') {
          m[i] = m[i].replace(RegExp(l + ' '), '');
        } else {
          m[i] = m[i].replace(RegExp(l.replace(/ [^ ]+$/, '') + ' '), '');
        }
      }
    }
  }
  return m;
};

const asyncAutoCompleter = async (line, cmds) => {
  cmds = await cmds(line);
  return autoCompleterFormatter(line, cmds);
};

const autoCompleter = (line, cmds) => {
  if (typeof cmds === 'function') {
    cmds = cmds(line);
  }
  return autoCompleterFormatter(line, cmds);
};

const autoCompleterFormatter = (line, cmds) => {
  let max = 0;

  // first element in cmds can be an object with special instructions
  let options = {
    filter: str => str
  };
  if (typeof cmds[0] === 'object') {
    const f = cmds[0].filter;
    if (typeof f === 'function') {
      options.filter = f;
    }
    cmds = cmds.slice(1);
  }

  cmds = cmds.reduce((sum, el) => {
    let sanitizedLine = line.replace(/[\\\.\+\*\?\^\$\[\]\(\)\{\}\/\'\#\:\!\=\|]/ig, '\\$&');
    RegExp(`^${sanitizedLine}`).test(el) && sum.push(el) && (max = Math.max(max, el.length));
    return sum;
  }, []);

  if (cmds.length > 1) {
    let commonStr = '';
    LOOP: for (let i = line.length; i < max; i++) {
      let c = null;
      for (let l of cmds) {
        if (!l[i]) {
          break LOOP;
        } else if (!c) {
          c = l[i];
        } else if (c !== l[i]) {
          break LOOP;
        }
      }
      commonStr += c;
    }
    if (commonStr) {
      return { match: options.filter(line + commonStr) };
    } else {
      return { matches: cmds };
    }
  } else if (cmds.length === 1) {
    return { match: options.filter(cmds[0]) };
  } else {
    return { match: options.filter(line) };
  }
};

const initAutoCompletion = async (context, autoCompletion) => {
  if (!autoCompleters[context]) {
    if (isAsyncFunc(autoCompletion)) {
      autoCompleters[context] = async l => asyncAutoCompleter(l, autoCompletion);
    } else if (autoCompletion) {
      autoCompleters[context] = l => autoCompleter(l, autoCompletion);
    } else {
      autoCompleters[context] = () => [];
    }
  }
  return Promise.resolve(); // Ensure this function always returns a resolved promise
};

// Create the command prompt using @inquirer/core
const commandPrompt = createPrompt((config, done) => {
  // Initialize state
  const [status, setStatus] = useState('pending');
  const [value, setValue] = useState('');
  const [error, setError] = useState();
  const [multiLineMode, setMultiLineMode] = useState(false);
  const [multiLineBuffer, setMultiLineBuffer] = useState([]);
  const prefix = usePrefix();

  // Initialize history handler
  const context = config.context || '_default';
  const historyOptions = config.history || {};
  const onCtrlEnd = config.onCtrlEnd;
  const parameterExamples = config.parameterExamples || [];

  // Check for a user-provided custom history handler
  let historyHandler;
  const hasRequiredHistoryMethods = config.historyHandler &&
    typeof config.historyHandler.init === 'function' &&
    typeof config.historyHandler.add === 'function' &&
    typeof config.historyHandler.getPrevious === 'function' &&
    typeof config.historyHandler.getNext === 'function' &&
    typeof config.historyHandler.getAll === 'function' &&
    typeof config.historyHandler.resetIndex === 'function';

  if (hasRequiredHistoryMethods) {
    historyHandler = config.historyHandler;
    // Configure the custom handler if it supports setConfig
    if (typeof historyHandler.setConfig === 'function') {
      historyHandler.setConfig(historyOptions);
    }
  } else {
    // Initialize default history handler
    historyHandler = new DefaultHistory(historyOptions);
  }

  // Initialize history for the current context
  historyHandler.init(context);

  // Initialize autocomplete for the current context
  initAutoCompletion(context, config.autoCompletion);

  // Handle keypress events
  useKeypress(async (key, rl) => {
    // Call onBeforeKeyPress if defined
    if (config.onBeforeKeyPress) {
      config.onBeforeKeyPress(key);
    }

    const rewrite = line => {
      if (config.onBeforeRewrite) {
        line = config.onBeforeRewrite(line);
      }
      rl.line = line;
      rl.write(null, { ctrl: true, name: 'e' });
    };

    // Handle Alt+E for multi-line mode toggling
    if (key.name === 'e' && key.alt) {
      if (multiLineMode) {
        // Exiting multi-line mode: submit the buffered content + current line
        const newBuffer = [...multiLineBuffer, rl.line];
        setMultiLineBuffer(newBuffer);
        const finalAnswer = newBuffer.join('\n');
        setMultiLineMode(false);
        setValue(finalAnswer);

        // Submit the answer
        if (config.validate) {
          const validationResult = await config.validate(finalAnswer);
          if (validationResult !== true) {
            setError(validationResult || 'Invalid input');
            return;
          }
        }
        setStatus('answered');
        done(finalAnswer);
      } else {
        // Entering multi-line mode
        setMultiLineMode(true);
        if (rl.line) { // Buffer current line if not empty
          setMultiLineBuffer([rl.line]);
        }
        rl.line = ''; // Clear current line for new multi-line input
      }
      return;
    }

    // Handle Ctrl+C to cancel multi-line mode
    if (multiLineMode && key.name === 'c' && key.ctrl) {
      setMultiLineMode(false);
      setMultiLineBuffer([]);
      rl.line = ''; // Clear the line
      setValue('');
      setStatus('answered');
      done('');
      return;
    }

    // If in multi-line mode, and the key wasn't one of the above special keys,
    // allow normal key processing but don't trigger history/autocomplete.
    if (multiLineMode) {
      return;
    }

    // Ensure history is initialized for the context
    historyHandler.init(context);

    // Ensure autocompleter is initialized for the current context
    await initAutoCompletion(context, config.autoCompletion);

    // Handle up arrow for history navigation
    if (key.name === 'up') {
      const previousCommand = historyHandler.getPrevious(context);
      if (previousCommand !== undefined) {
        rewrite(previousCommand);
        setValue(previousCommand);
      }
    }
    // Handle down arrow for history navigation
    else if (key.name === 'down') {
      const nextCommand = historyHandler.getNext(context);
      const lineValue = nextCommand !== undefined ? nextCommand : '';
      rewrite(lineValue);
      setValue(lineValue);
    }
    // Handle tab for autocompletion
    else if (key.name === 'tab') {
      const currentLine = rl.line;

      // 1. Try parameter autocompletion first
      if (parameterExamples && parameterExamples.length > 0) {
        // Only attempt parameter completion if currentLine is not empty
        if (currentLine.length > 0) {
          for (const example of parameterExamples) {
            if (example.startsWith(currentLine)) {
              rewrite(example);
              setValue(example);
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
          let ac;
          // initAutoCompletion ensures autoCompleters[context] is a function.
          if (isAsyncFunc(config.autoCompletion)) {
            ac = await autoCompleters[context](lineForCommandAutocomplete);
          } else if (typeof config.autoCompletion === 'function' || Array.isArray(config.autoCompletion)) {
            // autoCompleters[context] would have been initialized by initAutoCompletion
            if (typeof autoCompleters[context] === 'function') {
              ac = autoCompleters[context](lineForCommandAutocomplete);
            } else {
              ac = {};
            }
          } else {
            ac = {};
          }

          if (ac.match) {
            rewrite(ac.match);
            setValue(ac.match);
          } else if (ac.matches && ac.matches.length > 0) {
            console.log();
            if (typeof process.stdout.cursorTo === 'function') {
              process.stdout.cursorTo(0);
            }
            console.log(config.autocompletePrompt || chalk.red('>> ') + chalk.grey('Available commands:'));
            console.log(formatList(
              config.short
                ? (typeof config.short === 'function'
                  ? config.short(lineForCommandAutocomplete, ac.matches)
                  : short(lineForCommandAutocomplete, ac.matches))
                : ac.matches,
              config.maxSize, config.ellipsize, config.ellipsis
            ));
            rewrite(lineForCommandAutocomplete);
          } else {
            // No matches found, keep the current line
            rewrite(currentLine);
          }
        } catch (err) {
          console.error('Error during tab completion:', err);
          rewrite(currentLine);
        }
      }
    }
    // Handle Shift+Right Arrow to display history
    else if (key.name === 'right' && key.shift) {
      if (key.ctrl) {
        // History recall by number if current line is a number
        const lineAsIndex = parseInt(rl.line, 10);
        if (!isNaN(lineAsIndex)) {
          const historyEntries = historyHandler.getAll(context);
          if (lineAsIndex >= 0 && lineAsIndex < historyEntries.length) {
            rewrite(historyEntries[lineAsIndex]);
            setValue(historyEntries[lineAsIndex]);
          } else {
            rewrite('');
            setValue('');
          }
        } else {
          rewrite('');
          setValue('');
        }
      } else {
        // Display all history entries
        const historyEntries = historyHandler.getAll(context);
        const historyConfig = historyHandler.config || {};
        const historyLimit = historyConfig.limit !== undefined ? historyConfig.limit : 100;

        console.log(); // Newline before history list
        console.log(chalk.bold('History:'));
        if (historyEntries.length === 0) {
          console.log(chalk.grey('  (No history)'));
        } else {
          for (let i = 0; i < historyEntries.length; i++) {
            console.log(`${chalk.grey(formatIndex(i, historyLimit))}  ${historyEntries[i]}`);
          }
        }
        rewrite('');
        setValue('');
      }
    }
    // Handle Ctrl+End
    else if (key.name === 'end' && key.ctrl) {
      if (typeof onCtrlEnd === 'function') {
        const result = onCtrlEnd(rl.line);
        rewrite(result);
        setValue(result);
      } else {
        rewrite('');
        setValue('');
      }
    }
    // Handle Enter key for submission
    else if (key.name === 'return') {
      const answer = rl.line;

      // Validate the answer if a validate function is provided
      if (config.validate) {
        const validationResult = await config.validate(answer);
        if (validationResult !== true) {
          setError(validationResult || 'Invalid input');
          return;
        }
      }

      // Add to history
      if (answer !== undefined) {
        historyHandler.add(context, answer);
      }

      // Set status to answered and return the answer
      setValue(answer);
      setStatus('answered');
      done(answer);
    }
  });

  // Render the prompt
  const message = chalk.bold(config.message);
  let formattedValue = value;

  if (status === 'answered' && !config.noColorOnAnswered) {
    formattedValue = chalk[config.colorOnAnswered || 'cyan'](value);
  }

  if (config.transformer) {
    formattedValue = config.transformer(value, { isFinal: status === 'answered' });
  }

  // Add multi-line indicator if in multi-line mode
  const multiLineIndicator = multiLineMode ? chalk.yellow(' [multi-line mode]') : '';

  return {
    prefix,
    message: `${message}${multiLineIndicator}`,
    value: formattedValue,
    error,
    status,
    onClose: config.onClose
  };
});

export default commandPrompt;
