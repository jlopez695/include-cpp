EXENAME = main

CXX ?= clang++
CXXFLAGS ?= -std=c++11 -g -O0 -Wall -Wextra
SHARED_INCLUDE ?= ../_shared

all : $(EXENAME)

$(EXENAME): main.cpp Pet.h Pet.o
	$(CXX) $(CXXFLAGS) main.cpp Pet.o -o $(EXENAME)

Pet.o: Pet.h Pet.cpp
	$(CXX) $(CXXFLAGS) -c Pet.cpp

.PHONY: clean test
test: Pet.h Pet.cpp tests/grader.cpp
	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) Pet.cpp tests/grader.cpp -o test_runner
	./test_runner
	rm -f test_runner

clean:
	rm -f $(EXENAME) Pet.o test_runner
