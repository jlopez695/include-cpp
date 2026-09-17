EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++17 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): driver.cc fizz-buzz.cc
	$(CXX) $(CXXFLAGS) driver.cc fizz-buzz.cc -o $(EXENAME)

.PHONY: clean test
test: fizz-buzz.cc tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) fizz-buzz.cc tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
