#include <iostream>
#include <ctime>
#include "../epoch.h"

int passed = 0;
int failed = 0;

void check(const std::string& label, bool condition) {
    if (condition) {
        std::cout << "[PASS] " << label << "\n";
        passed++;
    } else {
        std::cout << "[FAIL] " << label << "\n";
        failed++;
    }
}

int main() {
    // hours: seconds / 3600
    check("hours(0) == 0",           hours(0) == 0);
    check("hours(3600) == 1",        hours(3600) == 1);
    check("hours(7200) == 2",        hours(7200) == 2);
    check("hours(3599) == 0",        hours(3599) == 0);  // integer division
    check("hours(86400) == 24",      hours(86400) == 24);

    // days: seconds / 86400
    check("days(0) == 0",            days(0) == 0);
    check("days(86400) == 1",        days(86400) == 1);
    check("days(172800) == 2",       days(172800) == 2);
    check("days(86399) == 0",        days(86399) == 0);  // integer division
    check("days(31536000) == 365",   days(31536000) == 365);

    // years: seconds / (86400 * 365)
    check("years(0) == 0",           years(0) == 0);
    check("years(31536000) == 1",    years(31536000) == 1);
    check("years(63072000) == 2",    years(63072000) == 2);
    check("years(31535999) == 0",    years(31535999) == 0);  // integer division

    std::cout << "\n" << passed << "/" << (passed + failed) << " tests passed\n";
    return failed == 0 ? 0 : 1;
}
