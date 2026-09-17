#include <string>
#include <type_traits>
#include "grader_harness.h"
#include "student.hpp"

POTD_TEST("Student is default-constructible") {
    Student s;
    (void)s;
}

POTD_TEST("first_name is std::string") {
    POTD_ASSERT((std::is_same<decltype(std::declval<Student>().first_name), std::string>::value));
}

POTD_TEST("last_name is std::string") {
    POTD_ASSERT((std::is_same<decltype(std::declval<Student>().last_name), std::string>::value));
}

POTD_TEST("uin is unsigned int") {
    POTD_ASSERT((std::is_same<decltype(std::declval<Student>().uin), unsigned int>::value));
}

POTD_TEST("first_name can be assigned and read back") {
    Student s;
    s.first_name = "Ada";
    POTD_ASSERT_EQ(s.first_name, "Ada");
}

POTD_TEST("last_name can be assigned and read back") {
    Student s;
    s.last_name = "Lovelace";
    POTD_ASSERT_EQ(s.last_name, "Lovelace");
}

POTD_TEST("uin can be assigned and read back") {
    Student s;
    s.uin = 987654321u;
    POTD_ASSERT_EQ(s.uin, 987654321u);
}

POTD_TEST("separate Student instances hold independent data") {
    Student a;
    a.first_name = "Grace";
    a.last_name = "Hopper";
    a.uin = 111111111u;

    Student b;
    b.first_name = "Alan";
    b.last_name = "Turing";
    b.uin = 222222222u;

    POTD_ASSERT_EQ(a.first_name, "Grace");
    POTD_ASSERT_EQ(a.last_name, "Hopper");
    POTD_ASSERT_EQ(a.uin, 111111111u);
    POTD_ASSERT_EQ(b.first_name, "Alan");
    POTD_ASSERT_EQ(b.last_name, "Turing");
    POTD_ASSERT_EQ(b.uin, 222222222u);
}

int main() { return potd::run_all(); }
