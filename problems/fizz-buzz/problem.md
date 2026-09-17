# Fizz Buzz

In this problem, you will write a solution to the Fizz Buzz problem (description to follow) within the body of the function `FizzBuzz`. I understand that we haven't discussed functions in detail yet. What you need to know is that our auto-grader will invoke your implementation (the code within the function body) with an integer value to initialize the parameter `int n`.

You will write your definition of Fizz Buzz between the curly braces and with respect to the value stored in the parameter `n`. Your function will return a string literal based on the value of `n`:

- The string literal `Fizz` (`return "Fizz";`) if `n` is divisible by `3`
- The string literal `Buzz` if `n` is divisible by `5`
- The string literal `FizzBuzz` if `n` is divisible by `3` and `5`
- The `n` encoded as a string (`return std::to_string(n);`) if `n` is not divisible by `3` and/or `5`

Hint: the modulus operator will likely prove useful in this problem.

You will define `FizzBuzz` in `fizz-buzz.cc`. You can test your implementation in `driver.cc` by calling `FizzBuzz` with different arguments.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
