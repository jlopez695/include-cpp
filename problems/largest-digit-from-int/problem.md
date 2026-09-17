# Largest Digit Within an Integer

## The Files

Here's a brief description of the files you've been given:

- fun.cc: Put your code in here. This is the only file that is graded.
- driver.cc: A driver file that calls your function with a few arguments and prints the results. Edit it freely to try other values — it is not graded.
- Makefile: Compiles your code for you.

## The Problem

In this problem, you will use a combination of iteration, the modulo operator, and the division operator to extract the individual digits comprising an integer value. During this process, you will keep track of the largest digit you have observed. At the end of the process, you will return the largest digit to the caller.

You will write your solution to this problem within the body of `LargestDigit`. If functions haven't been covered in detail yet, all you need to know is that the autograder will invoke your implementation (the code within the function body) with different arguments that become stored in the parameter `number`. Your solution should be written with respect to `number`.

To summarize, you are to find the largest digit within `number`. For example, if the autograder calls `LargestDigit(1234)`, your solution should return `4`. Likewise, for `LargestDigit(784)`, your implementation would return `8`.

You will define `LargestDigit` in fun.cc. You can test your implementation in driver.cc by calling `LargestDigit` with different arguments.

Consider only the cases where the parameter `number` is greater than or equal to zero.

## Testing Your Code

Run the following commands to compile and execute your code:

```
make
./main
```

## Sample Output

With the calls already present in driver.cc — `LargestDigit(787)` and `LargestDigit(567)` — you should see:

```
8
7
```

## Graded Files

The only file that will be submitted for grading on this problem is fun.cc
