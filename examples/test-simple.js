import commandPrompt from '../index.js';

  console.log('Testing basic command prompt functionality...');
  
  try {
    // Test 1: Basic prompt
    console.log('\n1. Testing basic prompt (type "hello" and press Enter):');
    const answer1 = await commandPrompt({
     onCtrlEnd: (line) => {
      return line.toUpperCase(); // Convert to uppercase on Ctrl+End
     },
     message: 'Enter a command:',
      context: 'test1'
    });
    console.log(`You entered: "${answer1}"`);
    
    // Test 2: With validation
    console.log('\n2. Testing validation (must contain "test"):');
    const answer2 = await commandPrompt({
      onCtrlEnd: (line) => {
       return line.toUpperCase(); // Convert to uppercase on Ctrl+End
      },
      message: 'Enter something with "test":',
      context: 'test2',
      validate: (input) => {
        return input.includes('test') ? true : 'Input must contain "test"';
      }
    });
    console.log(`You entered: "${answer2}"`);
    
    // Test 3: With autocompletion
    console.log('\n3. Testing autocompletion (press TAB to see suggestions):');
    const answer3 = await commandPrompt({
     onCtrlEnd: (line) => {
      return line.toUpperCase(); // Convert to uppercase on Ctrl+End
     },
     message: 'Enter a command (try "f" + TAB):',
      context: 'test3',
      autoCompletion: ['foo', 'bar', 'foobar', 'fizz', 'buzz']
    });
    console.log(`You entered: "${answer3}"`);
    
    // Test 4: History navigation (use up/down arrows)
    console.log('\n4. Testing history (use up/down arrows to navigate previous commands):');
    const answer4 = await commandPrompt({
     onCtrlEnd: (line) => {
      return line.toUpperCase(); // Convert to uppercase on Ctrl+End
     },
     message: 'Enter a command (try up/down arrows):',
      context: 'test3' // Same context as test 3 to share history
    });
    console.log(`You entered: "${answer4}"`);
    
    console.log('\nAll tests completed successfully!');
    
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('\nTest interrupted by user (Ctrl+C)');
    } else {
      console.error('Test failed:', error);
    }
  }
