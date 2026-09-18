#include <ctime>
#include "../epoch.h"
#include "grader_harness.h"

// hours: seconds / 3600
GRADER_TEST("hours(0) == 0") {
    GRADER_ASSERT_EQ(hours(0), 0);
}
GRADER_TEST("hours(3600) == 1") {
    GRADER_ASSERT_EQ(hours(3600), 1);
}
GRADER_TEST("hours(7200) == 2") {
    GRADER_ASSERT_EQ(hours(7200), 2);
}
GRADER_TEST("hours(3599) == 0 (integer division)") {
    GRADER_ASSERT_EQ(hours(3599), 0);
}
GRADER_TEST("hours(86400) == 24") {
    GRADER_ASSERT_EQ(hours(86400), 24);
}

// days: seconds / 86400
GRADER_TEST("days(0) == 0") {
    GRADER_ASSERT_EQ(days(0), 0);
}
GRADER_TEST("days(86400) == 1") {
    GRADER_ASSERT_EQ(days(86400), 1);
}
GRADER_TEST("days(172800) == 2") {
    GRADER_ASSERT_EQ(days(172800), 2);
}
GRADER_TEST("days(86399) == 0 (integer division)") {
    GRADER_ASSERT_EQ(days(86399), 0);
}
GRADER_TEST("days(31536000) == 365") {
    GRADER_ASSERT_EQ(days(31536000), 365);
}

// years: seconds / (86400 * 365)
GRADER_TEST("years(0) == 0") {
    GRADER_ASSERT_EQ(years(0), 0);
}
GRADER_TEST("years(31536000) == 1") {
    GRADER_ASSERT_EQ(years(31536000), 1);
}
GRADER_TEST("years(63072000) == 2") {
    GRADER_ASSERT_EQ(years(63072000), 2);
}
GRADER_TEST("years(31535999) == 0 (integer division)") {
    GRADER_ASSERT_EQ(years(31535999), 0);
}

int main() { return grader::run_all(); }
