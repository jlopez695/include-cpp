#include <string>
#include "../Pet.h"
#include "grader_harness.h"

// Default constructor
POTD_TEST("Default: name == Rover") {
    Pet d;
    POTD_ASSERT(d.getName() == "Rover");
}
POTD_TEST("Default: birth_year == 2018") {
    Pet d;
    POTD_ASSERT_EQ(d.getBY(), 2018);
}
POTD_TEST("Default: type == dog") {
    Pet d;
    POTD_ASSERT(d.getType() == "dog");
}
POTD_TEST("Default: owner == Wade") {
    Pet d;
    POTD_ASSERT(d.getOwnerName() == "Wade");
}

// Parameterized constructor
POTD_TEST("Param: name == Whiskers") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    POTD_ASSERT(p.getName() == "Whiskers");
}
POTD_TEST("Param: birth_year == 2020") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    POTD_ASSERT_EQ(p.getBY(), 2020);
}
POTD_TEST("Param: type == cat") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    POTD_ASSERT(p.getType() == "cat");
}
POTD_TEST("Param: owner == Alice") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    POTD_ASSERT(p.getOwnerName() == "Alice");
}

// Parameterized with different values
POTD_TEST("Param2: name == Rex") {
    Pet p("Rex", 2015, "dog", "Bob");
    POTD_ASSERT(p.getName() == "Rex");
}
POTD_TEST("Param2: birth_year == 2015") {
    Pet p("Rex", 2015, "dog", "Bob");
    POTD_ASSERT_EQ(p.getBY(), 2015);
}
POTD_TEST("Param2: type == dog") {
    Pet p("Rex", 2015, "dog", "Bob");
    POTD_ASSERT(p.getType() == "dog");
}
POTD_TEST("Param2: owner == Bob") {
    Pet p("Rex", 2015, "dog", "Bob");
    POTD_ASSERT(p.getOwnerName() == "Bob");
}

int main() { return potd::run_all(); }
