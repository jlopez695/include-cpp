#include "grader_harness.h"
#include "number-utilities.hpp"

// The statement's own worked example.
POTD_TEST("NoOddDigitsInInt(1012) returns 2") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(1012), 2);
}

// The value left commented out in driver.cc — all three digits are odd.
POTD_TEST("NoOddDigitsInInt(111) returns 3") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(111), 3);
}

POTD_TEST("single odd digits each count as 1") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(1), 1);
    POTD_ASSERT_EQ(NoOddDigitsInInt(3), 1);
    POTD_ASSERT_EQ(NoOddDigitsInInt(5), 1);
    POTD_ASSERT_EQ(NoOddDigitsInInt(7), 1);
    POTD_ASSERT_EQ(NoOddDigitsInInt(9), 1);
}

POTD_TEST("single even digits, including 0, count as 0") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(0), 0);
    POTD_ASSERT_EQ(NoOddDigitsInInt(2), 0);
    POTD_ASSERT_EQ(NoOddDigitsInInt(4), 0);
    POTD_ASSERT_EQ(NoOddDigitsInInt(6), 0);
    POTD_ASSERT_EQ(NoOddDigitsInInt(8), 0);
}

POTD_TEST("a number made entirely of even digits returns 0") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(2468), 0);
}

POTD_TEST("a number made entirely of odd digits returns its digit count") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(13579), 5);
}

POTD_TEST("a repeated odd digit is counted each time it appears") {
    POTD_ASSERT_EQ(NoOddDigitsInInt(999), 3);
}

POTD_TEST("a large mixed-digit number counts odd digits correctly") {
    // 2147483647 -> digits 2,1,4,7,4,8,3,6,4,7 -> odd digits: 1,7,3,7 -> 4
    POTD_ASSERT_EQ(NoOddDigitsInInt(2147483647), 4);
}

int main() { return potd::run_all(); }
