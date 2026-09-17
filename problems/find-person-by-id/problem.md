# Find Person By Id

## The Files

- `person.hpp`: Defines the `Person` struct (`first_name`, `last_name`, `id`) — read-only.
- `utilities.hpp`: The header file. The declaration of `FindPersonById` is already provided — read-only.
- `utilities.cc`: The source file. Define `FindPersonById` here.
- `driver.cc`: A driver file for you to write test statements in and observe the output. Edit it freely to try things out — it is not graded.

## The Problem

Implement `const Person& FindPersonById(const std::vector<Person>& people, unsigned int id)`.

This function searches `people` for a `Person` with `id`. If the person exists, simply return `people.at(loc)` where `loc` is the index of the `Person` in `people`. If a `Person` with `id` is not found in `people`, report this to the caller by throwing an `std::runtime_error` with the message `Invalid id number`.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.

## Graded Files

`utilities.cc` is graded. `person.hpp` and `utilities.hpp` are provided and read-only. `driver.cc` is yours to experiment with.
