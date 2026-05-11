#include <iostream>
#include <string>
#include "../Pet.h"

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
    // Default constructor
    Pet d;
    check("Default: name == Rover",      d.getName() == "Rover");
    check("Default: birth_year == 2018", d.getBY() == 2018);
    check("Default: type == dog",        d.getType() == "dog");
    check("Default: owner == Wade",      d.getOwnerName() == "Wade");

    // Parameterized constructor
    Pet p("Whiskers", 2020, "cat", "Alice");
    check("Param: name == Whiskers",     p.getName() == "Whiskers");
    check("Param: birth_year == 2020",   p.getBY() == 2020);
    check("Param: type == cat",          p.getType() == "cat");
    check("Param: owner == Alice",       p.getOwnerName() == "Alice");

    // Parameterized with different values
    Pet p2("Rex", 2015, "dog", "Bob");
    check("Param2: name == Rex",         p2.getName() == "Rex");
    check("Param2: birth_year == 2015",  p2.getBY() == 2015);
    check("Param2: type == dog",         p2.getType() == "dog");
    check("Param2: owner == Bob",        p2.getOwnerName() == "Bob");

    std::cout << "\n" << passed << "/" << (passed + failed) << " tests passed\n";
    return failed == 0 ? 0 : 1;
}
