#include "grader_harness.h"

// solution.hpp is empty in the stub — the student writes their own
// declaration into it, so the grader can't rely on including it and
// instead declares the prototype itself, same as fizz-buzz and
// largest-digit-from-int did for their empty-header/single-file cases.
bool ContainsDuplicate(int array[], unsigned int array_size);

GRADER_TEST("an array of all-distinct values returns false") {
    int arr[] = {1, 2, 3, 4, 5};
    GRADER_ASSERT_FALSE(ContainsDuplicate(arr, 5));
}

GRADER_TEST("a duplicate in the middle of the array returns true") {
    int arr[] = {1, 2, 3, 2, 5};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 5));
}

GRADER_TEST("two adjacent equal values return true") {
    int arr[] = {5, 5};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 2));
}

GRADER_TEST("a duplicate split between the first and last positions returns true") {
    int arr[] = {7, 1, 2, 3, 7};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 5));
}

GRADER_TEST("every element identical returns true") {
    int arr[] = {9, 9, 9, 9};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 4));
}

GRADER_TEST("distinct negative values return false") {
    int arr[] = {-1, -2, -3};
    GRADER_ASSERT_FALSE(ContainsDuplicate(arr, 3));
}

GRADER_TEST("a duplicated negative value returns true") {
    int arr[] = {-4, -4, 7};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 3));
}

GRADER_TEST("a duplicated zero is still a duplicate") {
    int arr[] = {0, 5, 0};
    GRADER_ASSERT_TRUE(ContainsDuplicate(arr, 3));
}

GRADER_TEST("zero alongside other distinct values returns false") {
    int arr[] = {0, 1, 2};
    GRADER_ASSERT_FALSE(ContainsDuplicate(arr, 3));
}

GRADER_TEST("a single-element array is trivially distinct") {
    int arr[] = {42};
    GRADER_ASSERT_FALSE(ContainsDuplicate(arr, 1));
}

GRADER_TEST("an empty array is trivially distinct") {
    int arr[] = {0};  // placeholder storage; array_size 0 means it's never read
    GRADER_ASSERT_FALSE(ContainsDuplicate(arr, 0));
}

int main() { return grader::run_all(); }
