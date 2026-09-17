#include <string>
#include "grader_harness.h"

// fizz-buzz.cc ships without a header — driver.cc declares the prototype
// itself, so the grader does the same rather than inventing a fizz-buzz.h
// the student never sees.
std::string FizzBuzz(int n);

POTD_TEST("FizzBuzz(3) returns Fizz") {
    POTD_ASSERT_EQ(FizzBuzz(3), "Fizz");
}

POTD_TEST("FizzBuzz(5) returns Buzz") {
    POTD_ASSERT_EQ(FizzBuzz(5), "Buzz");
}

POTD_TEST("FizzBuzz(7) returns 7") {
    POTD_ASSERT_EQ(FizzBuzz(7), "7");
}

POTD_TEST("FizzBuzz(15) returns FizzBuzz") {
    POTD_ASSERT_EQ(FizzBuzz(15), "FizzBuzz");
}

POTD_TEST("multiples of 3 that are not multiples of 5 return Fizz") {
    POTD_ASSERT_EQ(FizzBuzz(9), "Fizz");
    POTD_ASSERT_EQ(FizzBuzz(33), "Fizz");
    POTD_ASSERT_EQ(FizzBuzz(99), "Fizz");
}

POTD_TEST("multiples of 5 that are not multiples of 3 return Buzz") {
    POTD_ASSERT_EQ(FizzBuzz(10), "Buzz");
    POTD_ASSERT_EQ(FizzBuzz(50), "Buzz");
    POTD_ASSERT_EQ(FizzBuzz(100), "Buzz");
}

// The classic wrong answer: checking n % 3 first and returning early, so 15
// comes back as "Fizz" instead of "FizzBuzz". Every multiple of 15 in range
// is worth pinning down separately from the single FizzBuzz(15) case above.
POTD_TEST("multiples of 15 return FizzBuzz, not Fizz or Buzz") {
    POTD_ASSERT_EQ(FizzBuzz(30), "FizzBuzz");
    POTD_ASSERT_EQ(FizzBuzz(45), "FizzBuzz");
    POTD_ASSERT_EQ(FizzBuzz(90), "FizzBuzz");
}

POTD_TEST("numbers divisible by neither come back as digits") {
    POTD_ASSERT_EQ(FizzBuzz(1), "1");
    POTD_ASSERT_EQ(FizzBuzz(2), "2");
    POTD_ASSERT_EQ(FizzBuzz(8), "8");
    POTD_ASSERT_EQ(FizzBuzz(101), "101");
}

// 0 % 3 == 0 and 0 % 5 == 0, so the spec's own rules make zero a FizzBuzz.
// Any straightforward modulus solution gets this for free; a solution that
// special-cases small numbers does not.
POTD_TEST("FizzBuzz(0) returns FizzBuzz") {
    POTD_ASSERT_EQ(FizzBuzz(0), "FizzBuzz");
}

// Negatives are likewise handled for free by the modulus rules: -3 % 3 == 0.
// std::to_string(-7) is "-7", which is what the fall-through must produce.
POTD_TEST("negative inputs follow the same rules") {
    POTD_ASSERT_EQ(FizzBuzz(-3), "Fizz");
    POTD_ASSERT_EQ(FizzBuzz(-5), "Buzz");
    POTD_ASSERT_EQ(FizzBuzz(-15), "FizzBuzz");
    POTD_ASSERT_EQ(FizzBuzz(-7), "-7");
}

int main() { return potd::run_all(); }
