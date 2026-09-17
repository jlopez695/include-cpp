# Individual words from std::string to std::vector<std::string>

In this activity, you will implement `std::vector<std::string> WordsToVector(std::string str)` in `utilities.cc`. This function must:

- Takes a single `std::string` as its argument
- Return a `std::vector` where each word (whitespace delimited) in the parameter `str` is an element, with all occurrences of the punctuation `{!, ?, ., ,}` removed from it.

Consider the following examples (`std::string --> std::vector`):

- `Hello, World!` --> `{"Hello", "World"}`
- `What is your name?` --> `{"What", "is", "your", "name"}`
- `Who? What? Where? Why? How?` --> `{"Who", "What", "Where", "Why", "How"}`

Do not include any libraries other than `<vector>` and `<string>` in your solution.

## Recommended process

Please do not overcomplicate this problem by attempting to use language facilities we have not taught. You can solve this problem using a combination of selection, iteration, and string concatenation. That's all you need!

Don't try to implement your solution to the whole problem at once! I recommend that you first create a function that removes the punctuation from an input string and returns a new string, containing all the original words, albeit with the punctuation removed. Before moving on, you can test your implementation driver.cc. Thereafter, you can define another function that returns an `std::vector<std::string>` that "splits" on whitespace an input string into a vector of "words"; extracting the last word will likely be a special case. You can test your word-extracting function by invoking it from the main function and printing out the contents of the `std::vector<std::string>` it returns using a for-statement. Finally, you can use these two functions to implement `WordsToVector`.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
