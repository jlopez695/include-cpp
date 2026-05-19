EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++11 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

.PHONY: all
all : $(EXENAME)

$(EXENAME): q2.cpp epoch.cpp epoch.h
	$(CXX) $(CXXFLAGS) q2.cpp epoch.cpp -o $(EXENAME)

.PHONY: clean test
test: epoch.cpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) epoch.cpp tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
