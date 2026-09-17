# Number of Odd Digits Within an Integer

## The Files

- `number-utilities.hpp`: The header file. Declare your function's signature here.
- `number-utilities.cc`: The source file. Define your function here.
- `driver.cc`: A driver file that calls your function and prints the result. Edit it freely to try other values — it is not graded.

## The Problem

You are going to declare and define a function using standard C++ conventions. Write a declaration for the function in the header file, and provide the function's definition in the corresponding source file.

The signature of the function you are responsible for is `NoOddDigitsInInt(int number)`, and its return type is `int`. Your implementation of `NoOddDigitsInInt(int number)` will use a combination of the modulo operator and division to peel off the digits comprising `number`, counting the number of odd digits. Your function will then return the number of odd digits comprising `number`.

For example, if `number` is initialized with `1012`, your function should return `2`, since there are two odd digits (`1` and `1`) presenting within it.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.

## Sample Output

```
$ ./main
2
```

## Graded Files

`number-utilities.hpp` and `number-utilities.cc` are graded. `driver.cc` is yours to experiment with.
