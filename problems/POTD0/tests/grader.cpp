#include <regex>
#include <string>
#include "../hello.h"
#include "grader_harness.h"

GRADER_TEST("starts with 'Hello world! My name is '") {
    const std::string result = hello();
    GRADER_ASSERT(result.substr(0, 24) == "Hello world! My name is ");
}

GRADER_TEST("contains ' and I am '") {
    const std::string result = hello();
    GRADER_ASSERT(result.find(" and I am ") != std::string::npos);
}

GRADER_TEST("ends with ' years old.'") {
    const std::string result = hello();
    GRADER_ASSERT(result.size() >= 11);
    GRADER_ASSERT(result.substr(result.size() - 11) == " years old.");
}

GRADER_TEST("name section is not empty") {
    const std::string result = hello();
    auto idx = result.find(" and I am ");
    GRADER_ASSERT(idx != std::string::npos);
    GRADER_ASSERT(idx > 24);
}

GRADER_TEST("full format matches the expected pattern") {
    const std::string result = hello();
    std::regex pattern(R"(Hello world! My name is .+ and I am \d+ years old\.)");
    GRADER_ASSERT(std::regex_match(result, pattern));
}

int main() { return grader::run_all(); }
