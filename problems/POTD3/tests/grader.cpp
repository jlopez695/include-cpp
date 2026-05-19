#include <iostream>
#include <sstream>
#include <string>
#include "../Circle.h"
#include "../q4.h"
#include "grader_harness.h"

// Each capture_* helper redirects std::cout into a buffer, invokes the
// student's function, and returns whatever was printed. The grader's job is
// to verify (a) the function produces output and (b) the printed memory
// address matches main's address (for pointer and reference) or differs
// from it (for pass-by-value, since the value parameter lives on the
// callee's stack).

static std::string capture_value(Circle c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    pass_by_value(c);
    std::cout.rdbuf(old);
    return buf.str();
}

static std::string capture_pointer(Circle* c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    pass_by_pointer(c);
    std::cout.rdbuf(old);
    return buf.str();
}

static std::string capture_ref(Circle& c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    pass_by_ref(c);
    std::cout.rdbuf(old);
    return buf.str();
}

static std::string address_of(const Circle& c) {
    std::ostringstream a;
    a << &c;
    return a.str();
}

POTD_TEST("pass_by_value produces output") {
    Circle c; c.setRadius(5);
    POTD_ASSERT(capture_value(c).size() > 0);
}

POTD_TEST("pass_by_value prints a DIFFERENT address than main") {
    Circle c; c.setRadius(5);
    const std::string main_addr = address_of(c);
    const std::string out = capture_value(c);
    POTD_ASSERT(out.find(main_addr) == std::string::npos);
}

POTD_TEST("pass_by_pointer produces output") {
    Circle c; c.setRadius(5);
    POTD_ASSERT(capture_pointer(&c).size() > 0);
}

POTD_TEST("pass_by_pointer prints the SAME address as main") {
    Circle c; c.setRadius(5);
    const std::string main_addr = address_of(c);
    const std::string out = capture_pointer(&c);
    POTD_ASSERT(out.find(main_addr) != std::string::npos);
}

POTD_TEST("pass_by_ref produces output") {
    Circle c; c.setRadius(5);
    POTD_ASSERT(capture_ref(c).size() > 0);
}

POTD_TEST("pass_by_ref prints the SAME address as main") {
    Circle c; c.setRadius(5);
    const std::string main_addr = address_of(c);
    const std::string out = capture_ref(c);
    POTD_ASSERT(out.find(main_addr) != std::string::npos);
}

int main() { return potd::run_all(); }
