#include <catch2/catch_test_macros.hpp>
#include <sstream>
#include <iostream>

void final();

TEST_CASE("Output is non-empty", "[grader]") {
    std::ostringstream buffer;
    std::streambuf* old = std::cout.rdbuf(buffer.rdbuf());

    final();

    std::cout.rdbuf(old);

    REQUIRE(buffer.str().size() > 0);
}
