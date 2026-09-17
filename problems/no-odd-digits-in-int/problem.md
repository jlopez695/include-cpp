# Compute the number of odd digits presenting within an integer value

In this problem, you are going to declare and define a function using standard C++ conventions. You will write a declaration for the function in the header file and provide the function's definition in the corresponding source file.

The signature of the function that you are responsible for is `NoOddDigitsInInt(int number)` and its return type is `int`. Your implementation of `NoOddDigitsInInt(int number)` will use a combination of the modulo operator and division to peel off the digits comprising `number`, counting the number of odd digits. Your function will then return the number of odd digits comprising `number`. For example, if `number` is initialized with `1012`, your function should return `2` since there are two odd digits presenting within it.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
