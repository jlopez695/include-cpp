# Find Person By Id

In this problem, you will implement the function `FindPersonById(const std::vector<Person>& people, unsigned int id)`. This function will search `people` for a `Person` with `id`. If the person exists, simply return `people.at(loc)` where `loc` is the index of the `Person` in `people`. If a `Person` with `id` is not found in `people`, report this to the caller by throwing an `std::runtime_error` with the message `Invalid id number`.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
