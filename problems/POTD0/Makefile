EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++17 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): q1.cpp hello.cpp
	$(CXX) $(CXXFLAGS) q1.cpp hello.cpp -o $(EXENAME)

.PHONY: clean test
test: hello.cpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) hello.cpp tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
