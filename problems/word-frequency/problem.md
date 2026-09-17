# Word Frequency Counter

## The Files

- `utilities.hpp`: The header file. The declaration of `WordFrequencyCounter` is already provided — read-only.
- `utilities.cc`: The source file. Define `WordFrequencyCounter` here.
- `driver.cc`: A driver file with a sample string already loaded. Edit it freely to try things out — it is not graded.

## The Problem

Implement `std::map<std::string,unsigned int> WordFrequencyCounter(std::string str)`. This function returns an `std::map` mapping the individual words (case insensitive) in `str` to their frequency count. `WordFrequencyCounter` must:

- Take a single `std::string str` as its argument,
- convert the contents of `str` to lower case using `tolower` (from `<cctype>`),
- remove all occurrences of the punctuation `{!, ?, ., ,}` from `str`,
- determine the individual words comprising `str`, and
- return an `std::map<std::string,unsigned int>` mapping the case-insensitive words to their frequency.

You do not need to modify `str` in place. Instead, you can (and should) create additional `std::string`s while processing `str`.

Consider the following examples (`std::string` --> `std::map<std::string, unsigned int>`):

```
"Howdy, World!"
--> { {"howdy" --> 1}, {"world" --> 1} }

"You must be the change you wish to see in the world."
--> { {"you" --> 2}, {"must" --> 1}, {"be" --> 1}, {"the" --> 2}, {"change" --> 1},
      {"wish" --> 1}, {"to" --> 1}, {"see" --> 1}, {"in" --> 1}, {"world" --> 1} }
```

### Recommended process

Do not overcomplicate this problem by attempting to use language facilities that haven't been taught. You can solve this problem using a combination of selection, iteration, and string concatenation — that's all you need. Don't try to implement your solution to the whole problem at once; leverage helper functions.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.

## Graded Files

`utilities.cc` is graded. `utilities.hpp` is provided and read-only. `driver.cc` is yours to experiment with.
