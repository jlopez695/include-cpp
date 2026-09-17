# Word Frequency Counter

In this activity, you will implement `std::map<std::string,unsigned int> WordFrequencyCounter(std::string str)`. This function will return an `std::map` mapping the individual words (case insensitive) to their frequency count. `WordFrequencyCounter` must implement the following behavior (be sure to leverage helper functions):

Given a single `std::string str` as its argument,
- convert the contents of `str` to lower case using `tolower` (from `<cctype>`),
- remove all occurrences of the punctuation `{!, ?, ., ,}` from `str`,
- determine the individual words comprising the `str`, and
- return an `std::map<std::string,unsigned int>` mapping the case-insensitive words to their frequency.

You do not need to modify `str` in place. Instead, you can (and should) create additional `std::string`s while processing `str`. Consider the following examples (`std::string --> std::map<std::string, unsigned int>`)

- `"Howdy, World!"` --> `{ {"howdy" --> 1}, {"world" --> 1} }`
- `"You must be the change you wish to see in the world."` --> `{ {"you" --> 2}, {"must" --> 1}, {"be" --> 1}, {"the" --> 2}, {"change" --> 1}, {"wish" --> 1}, {"to" --> 1}, {"see" --> 1}, {"in" --> 1}, {"world" --> 1} }`

## Recommended process

Do not overcomplicate this problem by attempting to use language facilities that we have not taught. You can solve this problem using a combination of selection, iteration, and string concatenation. That's all you need! Don't try to implement your solution to the whole problem at once!

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
