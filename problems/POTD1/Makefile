EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++0x -g -O0 -Wall -Wextra

.PHONY: all
all : $(EXENAME)

$(EXENAME): q2.cpp epoch.cpp epoch.h
	$(CXX) $(CXXFLAGS) q2.cpp epoch.cpp -o $(EXENAME)

.PHONY: clean test
test: epoch.cpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) epoch.cpp tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) test_runner
