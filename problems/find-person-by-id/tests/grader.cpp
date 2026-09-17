#include <stdexcept>
#include <string>
#include <vector>
#include "grader_harness.h"
#include "person.hpp"
#include "utilities.hpp"

namespace {

std::vector<Person> sample_people() {
    return {
        {"Ada", "Lovelace", 100},
        {"Alan", "Turing", 200},
        {"Grace", "Hopper", 300},
    };
}

}  // namespace

POTD_TEST("finds the first person in the vector by id") {
    std::vector<Person> people = sample_people();
    const Person& found = FindPersonById(people, 100);
    POTD_ASSERT_EQ(found.first_name, "Ada");
    POTD_ASSERT_EQ(found.last_name, "Lovelace");
    POTD_ASSERT_EQ(found.id, 100u);
}

POTD_TEST("finds a middle person in the vector by id") {
    std::vector<Person> people = sample_people();
    const Person& found = FindPersonById(people, 200);
    POTD_ASSERT_EQ(found.first_name, "Alan");
    POTD_ASSERT_EQ(found.last_name, "Turing");
    POTD_ASSERT_EQ(found.id, 200u);
}

POTD_TEST("finds the last person in the vector by id") {
    std::vector<Person> people = sample_people();
    const Person& found = FindPersonById(people, 300);
    POTD_ASSERT_EQ(found.first_name, "Grace");
    POTD_ASSERT_EQ(found.last_name, "Hopper");
    POTD_ASSERT_EQ(found.id, 300u);
}

// The prompt's own wording ("simply return people.at(loc)") means the
// return type (const Person&) must be a reference to the actual element
// stored in `people`, not a copy. Checking the address confirms the
// implementation used .at()/indexing rather than constructing a new
// Person with matching fields.
POTD_TEST("the returned reference refers to the actual element in the vector, not a copy") {
    std::vector<Person> people = sample_people();
    const Person& found = FindPersonById(people, 200);
    POTD_ASSERT_EQ(&found, &people[1]);
}

POTD_TEST("throws std::runtime_error with message \"Invalid id number\" when the id is absent") {
    std::vector<Person> people = sample_people();
    bool threw = false;
    try {
        FindPersonById(people, 999);
    } catch (const std::runtime_error& e) {
        threw = true;
        POTD_ASSERT_EQ(std::string(e.what()), std::string("Invalid id number"));
    }
    POTD_ASSERT(threw);
}

POTD_TEST("throws std::runtime_error with message \"Invalid id number\" for an empty vector") {
    std::vector<Person> people;
    bool threw = false;
    try {
        FindPersonById(people, 1);
    } catch (const std::runtime_error& e) {
        threw = true;
        POTD_ASSERT_EQ(std::string(e.what()), std::string("Invalid id number"));
    }
    POTD_ASSERT(threw);
}

int main() { return potd::run_all(); }
