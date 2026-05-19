#include <ctime>
#include "../epoch.h"
#include "grader_harness.h"

// hours: seconds / 3600
POTD_TEST("hours(0) == 0") {
    POTD_ASSERT_EQ(hours(0), 0);
}
POTD_TEST("hours(3600) == 1") {
    POTD_ASSERT_EQ(hours(3600), 1);
}
POTD_TEST("hours(7200) == 2") {
    POTD_ASSERT_EQ(hours(7200), 2);
}
POTD_TEST("hours(3599) == 0 (integer division)") {
    POTD_ASSERT_EQ(hours(3599), 0);
}
POTD_TEST("hours(86400) == 24") {
    POTD_ASSERT_EQ(hours(86400), 24);
}

// days: seconds / 86400
POTD_TEST("days(0) == 0") {
    POTD_ASSERT_EQ(days(0), 0);
}
POTD_TEST("days(86400) == 1") {
    POTD_ASSERT_EQ(days(86400), 1);
}
POTD_TEST("days(172800) == 2") {
    POTD_ASSERT_EQ(days(172800), 2);
}
POTD_TEST("days(86399) == 0 (integer division)") {
    POTD_ASSERT_EQ(days(86399), 0);
}
POTD_TEST("days(31536000) == 365") {
    POTD_ASSERT_EQ(days(31536000), 365);
}

// years: seconds / (86400 * 365)
POTD_TEST("years(0) == 0") {
    POTD_ASSERT_EQ(years(0), 0);
}
POTD_TEST("years(31536000) == 1") {
    POTD_ASSERT_EQ(years(31536000), 1);
}
POTD_TEST("years(63072000) == 2") {
    POTD_ASSERT_EQ(years(63072000), 2);
}
POTD_TEST("years(31535999) == 0 (integer division)") {
    POTD_ASSERT_EQ(years(31535999), 0);
}

int main() { return potd::run_all(); }
