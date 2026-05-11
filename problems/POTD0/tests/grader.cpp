#include <regex>
#include <string>
#include "../hello.h"
#include "grader_harness.h"

POTD_TEST("starts with 'Hello world! My name is '") {
    const std::string result = hello();
    POTD_ASSERT(result.substr(0, 24) == "Hello world! My name is ");
}

POTD_TEST("contains ' and I am '") {
    const std::string result = hello();
    POTD_ASSERT(result.find(" and I am ") != std::string::npos);
}

POTD_TEST("ends with ' years old.'") {
    const std::string result = hello();
    POTD_ASSERT(result.size() >= 11);
    POTD_ASSERT(result.substr(result.size() - 11) == " years old.");
}

POTD_TEST("name section is not empty") {
    const std::string result = hello();
    auto idx = result.find(" and I am ");
    POTD_ASSERT(idx != std::string::npos);
    POTD_ASSERT(idx > 24);
}

POTD_TEST("full format matches the expected pattern") {
    const std::string result = hello();
    std::regex pattern(R"(Hello world! My name is .+ and I am \d+ years old\.)");
    POTD_ASSERT(std::regex_match(result, pattern));
}

int main() { return potd::run_all(); }
