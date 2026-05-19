#include <iostream>
using namespace std;

// Forward-declare instead of `#include "final.cpp"`. The student edits
// src/final.cpp, which the CMakeLists compiles into the `src` static
// library that the `main` entry target links against — so a forward
// declaration is enough for the linker to resolve the call. Including
// the .cpp directly was fragile: it currently builds only because the
// archive's final.o isn't pulled in when main.o already defines the
// symbol, and any future free function added to final.cpp would trip
// a multiple-definition link error.
void final();

int main() {
    final();
}
