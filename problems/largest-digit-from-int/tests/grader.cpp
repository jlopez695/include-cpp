#include <climits>
#include "grader_harness.h"

// fun.cc ships without a header — driver.cc declares the prototype itself,
// so the grader does the same rather than inventing a fun.h the student
// never sees.
int LargestDigit(int number);

GRADER_TEST("the two calls in driver.cc") {
    GRADER_ASSERT_EQ(LargestDigit(787), 8);
    GRADER_ASSERT_EQ(LargestDigit(567), 7);
}

GRADER_TEST("the two examples from the problem statement") {
    GRADER_ASSERT_EQ(LargestDigit(1234), 4);
    GRADER_ASSERT_EQ(LargestDigit(784), 8);
}

GRADER_TEST("a single-digit number is its own largest digit") {
    for (int d = 1; d <= 9; ++d) {
        GRADER_ASSERT_EQ(LargestDigit(d), d);
    }
}

// Zero is the boundary the standard `while (number > 0)` loop skips
// entirely: the body never runs, so the answer is whatever the running
// maximum was initialized to. Initializing it to 0 is correct here and
// initializing it to -1 (or to some "unset" marker) is not. The statement
// restricts input to number >= 0, so 0 is in range and worth pinning on
// its own.
GRADER_TEST("LargestDigit(0) is 0") {
    GRADER_ASSERT_EQ(LargestDigit(0), 0);
}

GRADER_TEST("finds the largest digit wherever it sits in the number") {
    GRADER_ASSERT_EQ(LargestDigit(921), 9);   // first
    GRADER_ASSERT_EQ(LargestDigit(494), 9);   // middle
    GRADER_ASSERT_EQ(LargestDigit(129), 9);   // last
}

GRADER_TEST("a repeated largest digit is still reported once") {
    GRADER_ASSERT_EQ(LargestDigit(99), 9);
    GRADER_ASSERT_EQ(LargestDigit(8778), 8);
    GRADER_ASSERT_EQ(LargestDigit(111), 1);
}

// Catches a loop that stops early on a zero digit — e.g. one that treats a
// 0 remainder as a terminating condition instead of a digit, or that
// divides by 100 while taking `% 10`. Every value here has its maximum
// before at least one trailing zero.
GRADER_TEST("interior and trailing zeros do not end the scan early") {
    GRADER_ASSERT_EQ(LargestDigit(10), 1);
    GRADER_ASSERT_EQ(LargestDigit(100), 1);
    GRADER_ASSERT_EQ(LargestDigit(905), 9);
    GRADER_ASSERT_EQ(LargestDigit(1000000000), 1);
}

GRADER_TEST("works across a range of digit counts") {
    GRADER_ASSERT_EQ(LargestDigit(45), 5);
    GRADER_ASSERT_EQ(LargestDigit(3141), 4);
    GRADER_ASSERT_EQ(LargestDigit(271828), 8);
    GRADER_ASSERT_EQ(LargestDigit(86753090), 9);
}

// INT_MAX is the largest input the parameter can hold, so it is the widest
// digit walk a correct solution has to survive. Its digits are
// 2 1 4 7 4 8 3 6 4 7, so the answer is 8.
GRADER_TEST("handles the largest representable int") {
    GRADER_ASSERT_EQ(LargestDigit(INT_MAX), 8);
    GRADER_ASSERT_EQ(LargestDigit(2000000000), 2);
}

GRADER_TEST("the answer is always a single digit") {
    const int inputs[] = {0, 7, 42, 787, 1234, 90210, 999999, INT_MAX};
    for (int n : inputs) {
        const int result = LargestDigit(n);
        if (result < 0 || result > 9) {
            GRADER_FAIL("LargestDigit(" << n << ") returned " << result
                      << ", which is not a digit in 0-9");
        }
    }
}

int main() { return grader::run_all(); }
