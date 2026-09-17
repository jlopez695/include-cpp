# Fizz Buzz

## The Files

Here's a brief description of the files you've been given:

- fizz-buzz.cc: Put your code in here. This is the only file that is graded.
- driver.cc: A driver file that calls your function with a few arguments and prints the results. Edit it freely to try other values — it is not graded.
- Makefile: Compiles your code for you.

## The Problem

In this problem, you will write a solution to the Fizz Buzz problem within the body of the function `FizzBuzz`. If functions haven't been covered in detail yet, all you need to know is that the autograder will invoke your implementation (the code within the function body) with an integer value to initialize the parameter `int n`.

You will write your definition of Fizz Buzz between the curly braces and with respect to the value stored in the parameter `n`. Your function returns a string based on the value of `n`:

- The string `Fizz` (`return "Fizz";`) if `n` is divisible by 3
- The string `Buzz` if `n` is divisible by 5
- The string `FizzBuzz` if `n` is divisible by both 3 and 5
- The value of `n` encoded as a string (`return std::to_string(n);`) if `n` is divisible by neither 3 nor 5

Hint: the modulus operator will likely prove useful in this problem.

You will define `FizzBuzz` in fizz-buzz.cc. You can test your implementation in driver.cc by calling `FizzBuzz` with different arguments.

## Testing Your Code

Run the following commands to compile and execute your code:

```
make
./main
```

## Sample Output

With the calls already present in driver.cc — `FizzBuzz(3)`, `FizzBuzz(5)`, `FizzBuzz(7)`, and `FizzBuzz(15)` — you should see:

```
Fizz
Buzz
7
FizzBuzz
```

## Graded Files

The only file that will be submitted for grading on this problem is fizz-buzz.cc
