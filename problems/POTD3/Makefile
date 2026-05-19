EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++11 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): q4.o q4.h Circle.h Circle.o
	$(CXX) $(CXXFLAGS) main.cpp q4.o Circle.o -o $(EXENAME)

q4.o: q4.h q4.cpp
	$(CXX) $(CXXFLAGS) -c q4.cpp

Circle.o: Circle.h Circle.cpp
	$(CXX) $(CXXFLAGS) -c Circle.cpp

.PHONY: clean test
test: q4.cpp q4.h Circle.cpp Circle.h tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) q4.cpp Circle.cpp tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f *.o $(EXENAME) test_runner
