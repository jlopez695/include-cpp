#include <string>
#include <type_traits>
#include "grader_harness.h"
#include "student.hpp"

GRADER_TEST("Student is default-constructible") {
    Student s;
    (void)s;
}

GRADER_TEST("first_name is std::string") {
    GRADER_ASSERT((std::is_same<decltype(std::declval<Student>().first_name), std::string>::value));
}

GRADER_TEST("last_name is std::string") {
    GRADER_ASSERT((std::is_same<decltype(std::declval<Student>().last_name), std::string>::value));
}

GRADER_TEST("uin is unsigned int") {
    GRADER_ASSERT((std::is_same<decltype(std::declval<Student>().uin), unsigned int>::value));
}

GRADER_TEST("first_name can be assigned and read back") {
    Student s;
    s.first_name = "Ada";
    GRADER_ASSERT_EQ(s.first_name, "Ada");
}

GRADER_TEST("last_name can be assigned and read back") {
    Student s;
    s.last_name = "Lovelace";
    GRADER_ASSERT_EQ(s.last_name, "Lovelace");
}

GRADER_TEST("uin can be assigned and read back") {
    Student s;
    s.uin = 987654321u;
    GRADER_ASSERT_EQ(s.uin, 987654321u);
}

GRADER_TEST("separate Student instances hold independent data") {
    Student a;
    a.first_name = "Grace";
    a.last_name = "Hopper";
    a.uin = 111111111u;

    Student b;
    b.first_name = "Alan";
    b.last_name = "Turing";
    b.uin = 222222222u;

    GRADER_ASSERT_EQ(a.first_name, "Grace");
    GRADER_ASSERT_EQ(a.last_name, "Hopper");
    GRADER_ASSERT_EQ(a.uin, 111111111u);
    GRADER_ASSERT_EQ(b.first_name, "Alan");
    GRADER_ASSERT_EQ(b.last_name, "Turing");
    GRADER_ASSERT_EQ(b.uin, 222222222u);
}

int main() { return grader::run_all(); }
