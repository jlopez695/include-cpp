#include "grader_harness.h"
#include "number-utilities.hpp"

// The statement's own worked example.
GRADER_TEST("NoOddDigitsInInt(1012) returns 2") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(1012), 2);
}

// The value left commented out in driver.cc — all three digits are odd.
GRADER_TEST("NoOddDigitsInInt(111) returns 3") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(111), 3);
}

GRADER_TEST("single odd digits each count as 1") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(1), 1);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(3), 1);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(5), 1);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(7), 1);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(9), 1);
}

GRADER_TEST("single even digits, including 0, count as 0") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(0), 0);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(2), 0);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(4), 0);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(6), 0);
    GRADER_ASSERT_EQ(NoOddDigitsInInt(8), 0);
}

GRADER_TEST("a number made entirely of even digits returns 0") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(2468), 0);
}

GRADER_TEST("a number made entirely of odd digits returns its digit count") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(13579), 5);
}

GRADER_TEST("a repeated odd digit is counted each time it appears") {
    GRADER_ASSERT_EQ(NoOddDigitsInInt(999), 3);
}

GRADER_TEST("a large mixed-digit number counts odd digits correctly") {
    // 2147483647 -> digits 2,1,4,7,4,8,3,6,4,7 -> odd digits: 1,7,3,7 -> 4
    GRADER_ASSERT_EQ(NoOddDigitsInInt(2147483647), 4);
}

int main() { return grader::run_all(); }
