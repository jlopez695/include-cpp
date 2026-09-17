# struct Student

## The Files

- `student.hpp`: The header file. Declare your `Student` struct here.
- `student.cc`: The source file, in case you need it — a plain data struct with no member functions usually doesn't.
- `driver.cc`: A driver file for you to write test statements in and observe the output. Edit it freely to try things out — it is not graded.

## The Problem

Define the type `Student` using a `struct` declaration. Your `Student` type must have three data members:

| Member | Type |
| --- | --- |
| `first_name` | `std::string` |
| `last_name` | `std::string` |
| `uin` | `unsigned int` |

Until you've correctly defined the data members for `Student`, your program will not compile with the test suite. Don't forget what you need to `#include` to use an `std::string`.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.

## Graded Files

`student.hpp` and `student.cc` are graded. `driver.cc` is yours to experiment with.
