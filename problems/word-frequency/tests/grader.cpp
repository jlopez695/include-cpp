#include <map>
#include <string>
#include "grader_harness.h"
#include "utilities.hpp"

// std::map<std::string,unsigned int> has no operator<<, so GRADER_ASSERT_EQ
// (which streams both sides into the failure message) can't be used on
// whole maps directly. Compare size, then walk the expected map checking
// each key is present with the right count, so a mismatch reports exactly
// which word's count is wrong instead of just "assertion failed".
static void assert_maps_equal(const std::map<std::string, unsigned int>& actual,
                               const std::map<std::string, unsigned int>& expected) {
    GRADER_ASSERT_EQ(actual.size(), expected.size());
    for (const auto& [word, count] : expected) {
        auto it = actual.find(word);
        if (it == actual.end()) {
            GRADER_FAIL("expected key \"" << word << "\" to be present in the result map");
        }
        GRADER_ASSERT_EQ(it->second, count);
    }
}

GRADER_TEST("\"Howdy, World!\" maps each word (lowercased, punctuation removed) to 1") {
    assert_maps_equal(WordFrequencyCounter("Howdy, World!"),
                       {{"howdy", 1}, {"world", 1}});
}

GRADER_TEST("the statement's longer example counts repeated words correctly") {
    assert_maps_equal(
        WordFrequencyCounter("You must be the change you wish to see in the world."),
        {
            {"you", 2}, {"must", 1}, {"be", 1}, {"the", 2}, {"change", 1},
            {"wish", 1}, {"to", 1}, {"see", 1}, {"in", 1}, {"world", 1},
        });
}

// The exact string sitting in driver.cc.
GRADER_TEST("the driver's sample string counts and cleans correctly") {
    assert_maps_equal(WordFrequencyCounter("Howdy, Ags! Whoop!"),
                       {{"howdy", 1}, {"ags", 1}, {"whoop", 1}});
}

GRADER_TEST("word matching is case insensitive") {
    assert_maps_equal(WordFrequencyCounter("Cat cat CAT"), {{"cat", 3}});
}

GRADER_TEST("a trailing period is removed") {
    assert_maps_equal(WordFrequencyCounter("Yes."), {{"yes", 1}});
}

GRADER_TEST("a trailing comma is removed") {
    assert_maps_equal(WordFrequencyCounter("Wait,"), {{"wait", 1}});
}

GRADER_TEST("a trailing exclamation point is removed") {
    assert_maps_equal(WordFrequencyCounter("No!"), {{"no", 1}});
}

GRADER_TEST("all occurrences of punctuation within a single word are removed, not just the first") {
    assert_maps_equal(WordFrequencyCounter("Really??"), {{"really", 1}});
}

int main() { return grader::run_all(); }
