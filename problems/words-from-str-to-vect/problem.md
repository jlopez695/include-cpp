# Individual Words from std::string to std::vector<std::string>

## The Files

- `utilities.hpp`: The header file. The declaration of `WordsToVector` is already provided — read-only.
- `utilities.cc`: The source file. Define `WordsToVector` here.
- `driver.cc`: A driver file with a sample phrase already loaded into a string. Edit it freely to try things out — it is not graded.

## The Problem

Implement `std::vector<std::string> WordsToVector(std::string str)` in `utilities.cc`. This function must:

- Take a single `std::string` as its argument.
- Return a `std::vector` where each word (whitespace delimited) in the parameter `str` is an element, with all occurrences of the punctuation `{!, ?, ., ,}` removed from it.

Consider the following examples (`std::string` --> `std::vector`):

```
Hello, World!               --> {"Hello", "World"}
What is your name?          --> {"What", "is", "your", "name"}
Who? What? Where? Why? How? --> {"Who", "What", "Where", "Why", "How"}
```

Do not include any libraries other than `<vector>` and `<string>` in your solution.

### Recommended process

Don't try to implement your solution to the whole problem at once. First write a function that removes the punctuation from an input string and returns a new string, containing all the original words but with the punctuation removed — test it from `driver.cc`. Then write a function that splits an input string into a `std::vector<std::string>` of whitespace-delimited words; extracting the last word will likely be a special case. Finally, combine the two to implement `WordsToVector`.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.

## Graded Files

`utilities.cc` is graded. `utilities.hpp` is provided and read-only. `driver.cc` is yours to experiment with.
