EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++17 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): driver.cc number-utilities.cc number-utilities.hpp
	$(CXX) $(CXXFLAGS) driver.cc number-utilities.cc -o $(EXENAME)

.PHONY: clean test
test: number-utilities.cc number-utilities.hpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) -I. number-utilities.cc tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
