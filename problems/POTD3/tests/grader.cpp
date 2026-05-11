#include <iostream>
#include <sstream>
#include <string>
#include "../Circle.h"
#include "../q4.h"

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

std::string capture(void (*fn)(Circle), Circle c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    fn(c);
    std::cout.rdbuf(old);
    return buf.str();
}

std::string capture_ptr(void (*fn)(Circle*), Circle* c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    fn(c);
    std::cout.rdbuf(old);
    return buf.str();
}

std::string capture_ref(void (*fn)(Circle&), Circle& c) {
    std::ostringstream buf;
    std::streambuf* old = std::cout.rdbuf(buf.rdbuf());
    fn(c);
    std::cout.rdbuf(old);
    return buf.str();
}

int main() {
    Circle c;
    c.setRadius(5);
    Circle* ptr = &c;

    std::ostringstream addr;
    addr << &c;
    std::string main_addr = addr.str();

    // pass_by_value: prints a DIFFERENT address (copy on stack)
    std::string val_out = capture(pass_by_value, c);
    check("pass_by_value produces output", val_out.size() > 0);
    check("pass_by_value prints a DIFFERENT address than main",
        val_out.find(main_addr) == std::string::npos);

    // pass_by_pointer: prints the SAME address as main
    std::string ptr_out = capture_ptr(pass_by_pointer, ptr);
    check("pass_by_pointer produces output", ptr_out.size() > 0);
    check("pass_by_pointer prints the SAME address as main",
        ptr_out.find(main_addr) != std::string::npos);

    // pass_by_ref: prints the SAME address as main
    std::string ref_out = capture_ref(pass_by_ref, c);
    check("pass_by_ref produces output", ref_out.size() > 0);
    check("pass_by_ref prints the SAME address as main",
        ref_out.find(main_addr) != std::string::npos);

    std::cout << "\n" << passed << "/" << (passed + failed) << " tests passed\n";
    return failed == 0 ? 0 : 1;
}
