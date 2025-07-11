# inquirer-command-prompt

A simple, but powerful prompt with history management and dynamic autocomplete for [Inquirer](https://github.com/SBoudrias/Inquirer.js)

## Installation
```bash
npm install inquirer-command-prompt --save
```

## Usage

This package has been migrated to use the modern `@inquirer/prompts` API. You can use it in two ways:

### Method 1: Using @inquirer/prompts (Recommended)
```javascript
import commandPrompt from 'inquirer-command-prompt';

// Use the prompt directly
const answer = await commandPrompt({
message: '>',
validate: val => {
return val
? true
: 'If you don\'t know the available commands, type help for help'
},
// Command auto-completion
autoCompletion: ['ls', 'echo', 'find', 'cat', 'help'],
// Parameter auto-completion examples
parameterExamples: [
'ls -la',
'find . -name "*.js"',
'cat package.json'
],
// History configuration
history: {
save: true,
folder: './',
limit: 10,
blacklist: ['exit']
},
// Context for history management
context: 'main_context',
// Optional transformer for display
transformer: (input, { isFinal }) => {
return isFinal ? chalk.green(input) : input;
}
});

console.log('Command entered:', answer);
```

## Complete Example

```javascript
import chalk from 'chalk';
import commandPrompt from 'inquirer-command-prompt';

// Simple usage
const simpleCommand = await commandPrompt({
message: 'Enter command:',
autoCompletion: ['help', 'exit', 'clear']
});

// Advanced usage with all features
const advancedCommand = await commandPrompt({
message: chalk.blue('>'),
validate: val => val ? true : 'Please enter a command',

// Dynamic autocompletion
autoCompletion: (line) => {
if (line.startsWith('git ')) {
return ['git add', 'git commit', 'git push', 'git pull', 'git status'];
}
return ['git', 'npm', 'node', 'help', 'exit'];
},

// Parameter examples for tab completion
parameterExamples: [
'git commit -m "message"',
'git push origin main',
'npm install --save package-name',
'node script.js'
],

// History configuration
history: {
save: true,
folder: './.history',
limit: 50,
blacklist: ['password', 'secret']
},

// Context for separate command histories
context: 'main_terminal',

// Display customization
transformer: (input, { isFinal }) => {
return isFinal ? chalk.green(`✓ ${input}`) : input;
},

// Formatting options
short: true,
ellipsize: true,
maxSize: 40,

// Event handlers
onCtrlEnd: (line) => line.toUpperCase(),
onBeforeKeyPress: (key) => {
if (key.ctrl && key.name === 'l') {
console.clear();
}
}
});

console.log('You entered:', advancedCommand);
```

### Options

##### autoCompletion

Optional. Can be an array or a function that returns an array, accepting the partially typed command as a parameter.

The first element of the array can be an `options` object with a `filter` property:
```javascript
autoCompletion: [
{ filter: str => str.split(':')[0] },
'edit 12: Love is in the air',
'edit 36: Like a virgin'
]
```

For dynamic completion:
```javascript
autoCompletion: (line) => {
if (/(\.|\/|~)/.test(line)) {
return someFileAutoCompletion(line);
}
return ['ls', 'echo', 'find', 'cat', 'help'];
}
```

##### parameterExamples

Provides complete command examples with parameters for tab completion:
```javascript
parameterExamples: [
'git commit -m "initial commit"',
'git push origin main',
'npm install --save-dev jest'
]
```

##### short

Optional (default: `false`). If `true`, shows only the untyped portion of suggestions. Can also be a function for custom shortening logic.

##### context

Important for history management. Use different contexts for different command environments. Should be strings (e.g., 'main', 'git-context', 'npm-context').

##### history

Configuration for command history:
```javascript
history: {
  save: true,        // Save history to file
  folder: './',      // Directory for history file
  limit: 50,         // Maximum history entries
  blacklist: ['password', 'secret']  // Commands to exclude from history
}
  
```

##### Custom History Handler

You can provide a custom history handler that implements the required interface:
```javascript
class CustomHistoryHandler {
init(context) { /* Initialize history for context */ }
add(context, value) { /* Add command to history */ }
getPrevious(context) { /* Get previous command */ }
getNext(context) { /* Get next command */ }
getAll(context) { /* Get all commands */ }
resetIndex(context) { /* Reset history index */ }
}

const answer = await commandPrompt({
message: '>',
historyHandler: new CustomHistoryHandler()
});
```

##### Multi-line Input Mode

Press `Alt+E` to enter multi-line input mode:
- `Enter` adds a new line
- `Alt+E` again submits all lines as a single command
- `Ctrl+C` cancels multi-line mode

##### Other Options

- `validate`: Function to validate input
- `transformer`: Function to transform display of input
- `ellipsize`: Enable ellipsis for long suggestions
- `ellipsis`: Custom ellipsis character
- `maxSize`: Maximum column size for suggestions
- `onClose`: Function called when prompt is closed
- `onBeforeKeyPress`: Function called before key processing
- `onBeforeRewrite`: Function called before line rewrite
- `onCtrlEnd`: Function called when `Ctrl+End` is pressed
- `noColorOnAnswered`: Disable color change when answered
- `colorOnAnswered`: Specific color for answered state
- `autocompletePrompt`: Custom message for autocomplete display

### Keyboard Shortcuts

- `↑` / `↓` - Navigate command history
- `Tab` - Auto-complete command or parameters
- `Shift+→` - Show all history
- `Ctrl+Shift+→` - Recall history by number
- `Alt+E` - Toggle multi-line input mode
- `Ctrl+End` - Execute onCtrlEnd function
- `Ctrl+C` - Cancel (in multi-line mode)

## Migration Guide

### From inquirer-command-prompt v0.1.0 to v0.2.0

The package has been completely rewritten to use the modern `@inquirer/core` API:

**Major Changes:**
1. **Removed global configuration**: No more `setConfig()` - pass options directly to each prompt
2. **New invocation methods**: Can be used directly or with inquirer.registerPrompt()
3. **Enhanced features**: Multi-line input mode and parameter auto-completion
4. **Modern API**: Built on `@inquirer/core` instead of legacy Inquirer internals

**Old way (v0.1.0):**
```javascript
const inquirerCommandPrompt = require('inquirer-command-prompt');

// Global configuration (removed)
inquirerCommandPrompt.setConfig({
history: { save: true, limit: 10 }
});

inquirer.registerPrompt('command', inquirerCommandPrompt);
```

**New way (v0.2.0):**
```javascript
import commandPrompt from 'inquirer-command-prompt';

// Direct usage (recommended)
const answer = await commandPrompt({
message: '>',
history: { save: true, limit: 10 }
});

// Or with inquirer
inquirer.registerPrompt('command', commandPrompt);
```

### From legacy inquirer to @inquirer/prompts

If migrating from the old inquirer API to the new @inquirer/prompts API [[1]](https://github.com/SBoudrias/Inquirer.js/blob/master/packages/prompts/README.md):

**Legacy:**
```javascript
const inquirer = require('inquirer');
const answers = await inquirer.prompt([{ type: 'command', name: 'cmd', message: '>' }]);
```

**Modern:**
```javascript
import commandPrompt from 'inquirer-command-prompt';
const answer = await commandPrompt({ message: '>' });
```

## API Reference

### commandPrompt(config)

Returns a Promise that resolves to the entered command string.

**Parameters:**
- `config` (Object): Configuration object with all the options described above

**Returns:**
- `Promise<string>`: The command entered by the user

## Requirements

- Node.js 14+ (for ES modules support)
- `@inquirer/core` ^5.1.1

## Version History

**0.2.0**
* Complete rewrite using `@inquirer/core` API
* Removed global configuration (setConfig anti-pattern)
* Added direct invocation support alongside inquirer.registerPrompt
* Added multi-line input mode (Alt+E)
* Added parameter auto-completion with `parameterExamples`
* Enhanced history management with custom handler support
* Modern ES module syntax

**0.1.0**
* Updated to InquirerJS 7
* Legacy implementation

## License

MIT

## Credits

[Francesco Sullo](https://francesco.sullo.co)
```The updated README now reflects the migration to the `@inquirer/prompts` API with the new invocation interface. Key changes include:

1. **New Usage Section**: Shows both the recommended direct usage method and the legacy inquirer registration method
2. **Updated Examples**: All examples now use the modern API with `import` statements and direct function calls
3. **Enhanced Migration Guide**: Clearly explains the changes from v0.1.0 to v0.2.0 and how to migrate from legacy inquirer
4. **Modern API Documentation**: Updated to reflect the `@inquirer/core` based implementation
5. **Complete Examples**: Shows both simple and advanced usage patterns
6. **Installation and Requirements**: Updated to reflect modern Node.js and ES module requirements

The README now properly documents the new invocation interface where users can call the prompt directly as a function, while still supporting the legacy inquirer.registerPrompt() method for backward compatibility.
```