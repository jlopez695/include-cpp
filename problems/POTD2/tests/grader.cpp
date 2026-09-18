#include <string>
#include "../Pet.h"
#include "grader_harness.h"

// Default constructor
GRADER_TEST("Default: name == Rover") {
    Pet d;
    GRADER_ASSERT(d.getName() == "Rover");
}
GRADER_TEST("Default: birth_year == 2018") {
    Pet d;
    GRADER_ASSERT_EQ(d.getBY(), 2018);
}
GRADER_TEST("Default: type == dog") {
    Pet d;
    GRADER_ASSERT(d.getType() == "dog");
}
GRADER_TEST("Default: owner == Wade") {
    Pet d;
    GRADER_ASSERT(d.getOwnerName() == "Wade");
}

// Parameterized constructor
GRADER_TEST("Param: name == Whiskers") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    GRADER_ASSERT(p.getName() == "Whiskers");
}
GRADER_TEST("Param: birth_year == 2020") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    GRADER_ASSERT_EQ(p.getBY(), 2020);
}
GRADER_TEST("Param: type == cat") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    GRADER_ASSERT(p.getType() == "cat");
}
GRADER_TEST("Param: owner == Alice") {
    Pet p("Whiskers", 2020, "cat", "Alice");
    GRADER_ASSERT(p.getOwnerName() == "Alice");
}

// Parameterized with different values
GRADER_TEST("Param2: name == Rex") {
    Pet p("Rex", 2015, "dog", "Bob");
    GRADER_ASSERT(p.getName() == "Rex");
}
GRADER_TEST("Param2: birth_year == 2015") {
    Pet p("Rex", 2015, "dog", "Bob");
    GRADER_ASSERT_EQ(p.getBY(), 2015);
}
GRADER_TEST("Param2: type == dog") {
    Pet p("Rex", 2015, "dog", "Bob");
    GRADER_ASSERT(p.getType() == "dog");
}
GRADER_TEST("Param2: owner == Bob") {
    Pet p("Rex", 2015, "dog", "Bob");
    GRADER_ASSERT(p.getOwnerName() == "Bob");
}

int main() { return grader::run_all(); }
