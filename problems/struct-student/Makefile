EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++17 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): driver.cc student.cc student.hpp
	$(CXX) $(CXXFLAGS) driver.cc student.cc -o $(EXENAME)

.PHONY: clean test
test: student.cc student.hpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) -I. student.cc tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
