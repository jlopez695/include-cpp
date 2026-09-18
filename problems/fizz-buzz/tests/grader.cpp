#include <string>
#include "grader_harness.h"

// fizz-buzz.cc ships without a header — driver.cc declares the prototype
// itself, so the grader does the same rather than inventing a fizz-buzz.h
// the student never sees.
std::string FizzBuzz(int n);

GRADER_TEST("FizzBuzz(3) returns Fizz") {
    GRADER_ASSERT_EQ(FizzBuzz(3), "Fizz");
}

GRADER_TEST("FizzBuzz(5) returns Buzz") {
    GRADER_ASSERT_EQ(FizzBuzz(5), "Buzz");
}

GRADER_TEST("FizzBuzz(7) returns 7") {
    GRADER_ASSERT_EQ(FizzBuzz(7), "7");
}

GRADER_TEST("FizzBuzz(15) returns FizzBuzz") {
    GRADER_ASSERT_EQ(FizzBuzz(15), "FizzBuzz");
}

GRADER_TEST("multiples of 3 that are not multiples of 5 return Fizz") {
    GRADER_ASSERT_EQ(FizzBuzz(9), "Fizz");
    GRADER_ASSERT_EQ(FizzBuzz(33), "Fizz");
    GRADER_ASSERT_EQ(FizzBuzz(99), "Fizz");
}

GRADER_TEST("multiples of 5 that are not multiples of 3 return Buzz") {
    GRADER_ASSERT_EQ(FizzBuzz(10), "Buzz");
    GRADER_ASSERT_EQ(FizzBuzz(50), "Buzz");
    GRADER_ASSERT_EQ(FizzBuzz(100), "Buzz");
}

// The classic wrong answer: checking n % 3 first and returning early, so 15
// comes back as "Fizz" instead of "FizzBuzz". Every multiple of 15 in range
// is worth pinning down separately from the single FizzBuzz(15) case above.
GRADER_TEST("multiples of 15 return FizzBuzz, not Fizz or Buzz") {
    GRADER_ASSERT_EQ(FizzBuzz(30), "FizzBuzz");
    GRADER_ASSERT_EQ(FizzBuzz(45), "FizzBuzz");
    GRADER_ASSERT_EQ(FizzBuzz(90), "FizzBuzz");
}

GRADER_TEST("numbers divisible by neither come back as digits") {
    GRADER_ASSERT_EQ(FizzBuzz(1), "1");
    GRADER_ASSERT_EQ(FizzBuzz(2), "2");
    GRADER_ASSERT_EQ(FizzBuzz(8), "8");
    GRADER_ASSERT_EQ(FizzBuzz(101), "101");
}

int main() { return grader::run_all(); }
