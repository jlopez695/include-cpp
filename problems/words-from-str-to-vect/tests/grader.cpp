#include <string>
#include <vector>
#include "grader_harness.h"
#include "utilities.hpp"

// std::vector<std::string> has no operator<<, so GRADER_ASSERT_EQ (which
// streams both sides into the failure message) can't be used directly on
// whole vectors. Compare size first, then element-by-element with
// GRADER_ASSERT_EQ on the individual strings, so a mismatch reports exactly
// which word and index went wrong instead of just "assertion failed".
static void assert_vectors_equal(const std::vector<std::string>& actual,
                                  const std::vector<std::string>& expected) {
    GRADER_ASSERT_EQ(actual.size(), expected.size());
    for (std::size_t i = 0; i < expected.size(); ++i) {
        GRADER_ASSERT_EQ(actual[i], expected[i]);
    }
}

GRADER_TEST("\"Hello, World!\" splits into two words with punctuation removed") {
    assert_vectors_equal(WordsToVector("Hello, World!"), {"Hello", "World"});
}

GRADER_TEST("\"What is your name?\" splits into four words with the trailing ? removed") {
    assert_vectors_equal(WordsToVector("What is your name?"), {"What", "is", "your", "name"});
}

GRADER_TEST("\"Who? What? Where? Why? How?\" removes a ? from every word") {
    assert_vectors_equal(WordsToVector("Who? What? Where? Why? How?"),
                          {"Who", "What", "Where", "Why", "How"});
}

GRADER_TEST("a trailing period is removed") {
    assert_vectors_equal(WordsToVector("Yes."), {"Yes"});
}

GRADER_TEST("a trailing comma is removed") {
    assert_vectors_equal(WordsToVector("Wait,"), {"Wait"});
}

GRADER_TEST("all occurrences of punctuation within a single word are removed, not just the first") {
    assert_vectors_equal(WordsToVector("Really??"), {"Really"});
}

GRADER_TEST("a word with no punctuation is returned unchanged") {
    assert_vectors_equal(WordsToVector("hello"), {"hello"});
}

// The exact phrase given in driver.cc, applying the stated rules: split on
// whitespace, strip {!, ?, ., ,} from each resulting word.
GRADER_TEST("the driver's sample phrase splits and cleans correctly") {
    std::string phrase =
        "It was the best of times, it was the worst of times, it was the age of wisdom, "
        "it was the age of foolishness, it was the epoch of belief, it was the epoch of "
        "incredulity, it was the season of light, it was the season of darkness, it was "
        "the spring of hope, it was the winter of despair.";
    std::vector<std::string> expected = {
        "It", "was", "the", "best", "of", "times",
        "it", "was", "the", "worst", "of", "times",
        "it", "was", "the", "age", "of", "wisdom",
        "it", "was", "the", "age", "of", "foolishness",
        "it", "was", "the", "epoch", "of", "belief",
        "it", "was", "the", "epoch", "of", "incredulity",
        "it", "was", "the", "season", "of", "light",
        "it", "was", "the", "season", "of", "darkness",
        "it", "was", "the", "spring", "of", "hope",
        "it", "was", "the", "winter", "of", "despair",
    };
    assert_vectors_equal(WordsToVector(phrase), expected);
}

int main() { return grader::run_all(); }
